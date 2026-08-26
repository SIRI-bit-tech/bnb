import imaplib
import email
from email.header import decode_header
import re
import uuid
import html
import logging
import asyncio
from datetime import datetime
from config import settings
from database import AsyncSessionLocal
from sqlalchemy import select
from models.support import SupportTicket, TicketMessage
from models.user import User
from services.email import email_service
from routers.support import _clean_email_reply_body
from utils.ably import AblyRealtimeManager

logger = logging.getLogger(__name__)


def _decode_str(header_str: str) -> str:
    if not header_str:
        return ""
    decoded_list = decode_header(header_str)
    result = []
    for content, encoding in decoded_list:
        if isinstance(content, bytes):
            result.append(content.decode(encoding or "utf-8", errors="ignore"))
        else:
            result.append(str(content))
    return "".join(result)


def _extract_text_body(msg) -> str:
    body = ""
    html_fallback = ""
    if msg.is_multipart():
        for part in msg.walk():
            content_type = part.get_content_type()
            content_disposition = str(part.get("Content-Disposition", ""))
            if "attachment" in content_disposition.lower():
                continue
            if content_type == "text/plain" and not body:
                try:
                    payload = part.get_payload(decode=True)
                    if payload:
                        body = payload.decode(part.get_content_charset() or "utf-8", errors="ignore")
                except Exception:
                    pass
            elif content_type == "text/html" and not html_fallback:
                try:
                    payload = part.get_payload(decode=True)
                    if payload:
                        html_fallback = payload.decode(part.get_content_charset() or "utf-8", errors="ignore")
                except Exception:
                    pass
    else:
        try:
            content_type = msg.get_content_type()
            payload = msg.get_payload(decode=True)
            if payload:
                decoded = payload.decode(msg.get_content_charset() or "utf-8", errors="ignore")
                if content_type == "text/plain":
                    body = decoded
                else:
                    html_fallback = decoded
        except Exception:
            pass

    if not body and html_fallback:
        text = re.sub(r"<style[^>]*>[\s\S]*?</style>", "", html_fallback, flags=re.IGNORECASE)
        text = re.sub(r"<script[^>]*>[\s\S]*?</script>", "", text, flags=re.IGNORECASE)
        text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)
        text = re.sub(r"</p>", "\n\n", text, flags=re.IGNORECASE)
        text = re.sub(r"<[^>]+>", " ", text)
        body = html.unescape(text)

    return body.strip()


class HostingerIMAPSync:
    """Background service that logs into Hostinger IMAP and syncs support email replies."""

    @classmethod
    async def process_hostinger_inbox(cls):
        password = getattr(settings, "HOSTINGER_SUPPORT_PASSWORD", None)
        if not password or password == "your_hostinger_email_password":
            return

        server_host = getattr(settings, "HOSTINGER_IMAP_SERVER", "imap.hostinger.com")
        server_port = getattr(settings, "HOSTINGER_IMAP_PORT", 993)
        email_user = getattr(settings, "HOSTINGER_SUPPORT_EMAIL", "support@broadmontnationalb.com")

        try:
            loop = asyncio.get_running_loop()
            extracted_items = await loop.run_in_executor(
                None, cls._fetch_recent_imap_messages, server_host, server_port, email_user, password
            )

            if extracted_items:
                await cls._save_messages_to_db(extracted_items)
        except Exception as e:
            logger.error(f"Hostinger IMAP Sync error: {e}")

    @classmethod
    def _fetch_recent_imap_messages(cls, host: str, port: int, user: str, password: str) -> list[dict]:
        items = []
        try:
            mail = imaplib.IMAP4_SSL(host, port, timeout=15)
            mail.login(user, password)

            # Discover available folders (INBOX and Sent folders)
            folders_to_check = ["INBOX", "Sent", "INBOX.Sent", "INBOX/Sent", "Sent Items", "Sent Messages", "INBOX.Sent Items"]
            try:
                res, folder_list = mail.list()
                if res == "OK" and folder_list:
                    for f in folder_list:
                        fname = f.decode("utf-8", errors="ignore")
                        for target in ["sent", "inbox"]:
                            if target in fname.lower() and "junk" not in fname.lower() and "trash" not in fname.lower():
                                match_name = re.search(r'"([^"]+)"$', fname) or re.search(r'([^\s]+)$', fname)
                                if match_name:
                                    f_clean = match_name.group(1).strip('"')
                                    if f_clean and f_clean not in folders_to_check:
                                        folders_to_check.append(f_clean)
            except Exception as e:
                logger.warning(f"Error discovering IMAP folders: {e}")

            checked_folders = set()
            for folder in folders_to_check:
                if folder in checked_folders:
                    continue
                checked_folders.add(folder)

                try:
                    res, _ = mail.select(f'"{folder}"' if " " in folder else folder)
                    if res != "OK":
                        continue

                    status, messages = mail.search(None, "ALL")
                    if status != "OK" or not messages[0]:
                        continue

                    mail_ids = messages[0].split()
                    recent_ids = mail_ids[-25:]

                    for mail_id in recent_ids:
                        try:
                            fetch_res, data = mail.fetch(mail_id, "(RFC822)")
                            if fetch_res != "OK" or not data:
                                continue

                            raw_email = data[0][1]
                            msg = email.message_from_bytes(raw_email)

                            subject = _decode_str(msg.get("Subject"))
                            from_header = _decode_str(msg.get("From"))

                            match_from = re.search(r"[\w\.-]+@[\w\.-]+", from_header)
                            from_email = match_from.group(0).lower() if match_from else from_header.lower()

                            # Skip automated system notification senders
                            if "noreply@" in from_email or "resend" in from_email:
                                continue

                            # Skip initial automated system ticket alerts
                            if (subject.startswith("[Support Ticket #") or subject.startswith("Ticket Confirmation:") or subject.startswith("[Case #")) and not (subject.lower().startswith("re:") or subject.lower().startswith("fwd:")):
                                continue

                            raw_body = _extract_text_body(msg)
                            clean_body = _clean_email_reply_body(raw_body)

                            if not clean_body or len(clean_body.strip()) < 2:
                                continue

                            # If the cleaned body still contains system metadata tags, ignore it
                            if "BNB NEW TICKET" in clean_body or "Ticket Ref:" in clean_body or "Details / Request:" in clean_body:
                                continue

                            # Find Ticket reference (TKT...)
                            tkt_match = (
                                re.search(r"TKT[A-Z0-9]{8}", subject, re.IGNORECASE)
                                or re.search(r"TKT-[A-Z0-9]+", subject, re.IGNORECASE)
                                or re.search(r"TKT[A-Z0-9]{8}", clean_body, re.IGNORECASE)
                                or re.search(r"TKT-[A-Z0-9]+", clean_body, re.IGNORECASE)
                                or re.search(r"TKT[A-Z0-9]{6,10}", subject, re.IGNORECASE)
                                or re.search(r"TKT[A-Z0-9]{6,10}", clean_body, re.IGNORECASE)
                            )

                            items.append({
                                "tkt_ref": tkt_match.group(0) if tkt_match else None,
                                "from_email": from_email,
                                "subject": subject,
                                "clean_body": clean_body,
                                "folder": folder,
                            })
                        except Exception as inner_err:
                            logger.error(f"Error fetching mail {mail_id} in {folder}: {inner_err}")
                except Exception as folder_err:
                    logger.error(f"Error processing folder {folder}: {folder_err}")

            mail.logout()
        except Exception as e:
            logger.error(f"Failed IMAP login to Hostinger ({host}:{port} for {user}): {e}")
        return items

    @classmethod
    async def _save_messages_to_db(cls, items: list[dict]):
        async with AsyncSessionLocal() as db:
            from sqlalchemy import delete
            try:
                await db.execute(
                    delete(TicketMessage).where(
                        TicketMessage.message.ilike("%BNB NEW TICKET%") | TicketMessage.message.ilike("%Ticket Ref: #TKT%")
                    )
                )
                await db.commit()
            except Exception:
                pass

            for item in items:
                try:
                    tkt_ref_str = item["tkt_ref"]
                    from_email = item["from_email"]
                    clean_body = item["clean_body"]
                    subject = item["subject"]

                    ticket = None
                    if tkt_ref_str:
                        clean_ref = tkt_ref_str.upper().replace("-", "")
                        res = await db.execute(select(SupportTicket).where(SupportTicket.ticket_number.ilike(f"%{clean_ref}%")))
                        ticket = res.scalar_one_or_none()

                    if ticket:
                        existing_check = await db.execute(
                            select(TicketMessage).where(
                                TicketMessage.ticket_id == ticket.id,
                                TicketMessage.message == clean_body
                            )
                        )
                        if existing_check.scalar_one_or_none():
                            continue

                        user_res = await db.execute(select(User).where(User.id == ticket.user_id))
                        user = user_res.scalar_one_or_none()

                        is_staff = (
                            from_email == "support@broadmontnationalb.com"
                            or "support@" in from_email
                            or "admin" in from_email
                            or item.get("folder", "").lower() in ["sent", "inbox.sent", "sent items", "sent messages", "inbox/sent"]
                            or (user and from_email != user.email.lower())
                        )
                        sender_id = ticket.user_id if not is_staff else "support-agent"

                        msg_obj = TicketMessage(
                            id=str(uuid.uuid4()),
                            ticket_id=ticket.id,
                            sender_id=sender_id,
                            is_from_staff=is_staff,
                            message=clean_body,
                            created_at=datetime.utcnow()
                        )
                        db.add(msg_obj)

                        if is_staff:
                            ticket.status = "in_progress"
                        else:
                            ticket.status = "open"

                        await db.commit()
                        logger.info(f"Hostinger Sync: Saved reply to ticket #{ticket.ticket_number} from {from_email}")

                        try:
                            AblyRealtimeManager.publish_admin_event("support", {"type": "ticket_user_replied", "ticket_id": ticket.id, "reply_id": msg_obj.id})
                            sender_display = "Broadmont Support" if is_staff else (f"{user.first_name} {user.last_name}".strip() if user else from_email)
                            AblyRealtimeManager.publish_support_message(ticket.id, sender_id, sender_display, clean_body, is_staff)
                        except Exception:
                            pass
                except Exception as item_err:
                    logger.error(f"Error saving synced email item to DB: {item_err}")
