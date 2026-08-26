from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks, Body, File, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from models.support import SupportTicket, TicketMessage, Chat, ChatMessage
from database import get_db
import uuid
import re
from datetime import datetime, timedelta
from utils.auth import get_current_user_id
from pydantic import BaseModel, Field
from utils.ably import AblyRealtimeManager
from models.user import User
from models.admin import AdminUser
from models.notification import Notification, NotificationType
from config import settings
from services.email import email_service
from schemas.support import ContactFormRequest
import logging

router = APIRouter()

logger = logging.getLogger(__name__)

class CreateTicketRequest(BaseModel):
    subject: str = Field(..., min_length=3, max_length=160)
    description: str = Field(..., min_length=3, max_length=4000)
    category: str | None = None
    priority: str = Field(default="medium")
    attachment_url: str | None = None

# Chat endpoints
def _generate_auto_assistant_response(query: str) -> dict:
    """Generate smart automated banking assistant response with ticket escalation suggestion"""
    q = query.lower().strip()
    
    # 1. Routing & Bank Information
    if any(w in q for w in ["routing number", "routing", "swift code", "swift", "bic", "iban", "bank code", "wire instructions"]):
        return {
            "reply": "Broadmont National Bank Routing Number is 021000021 for domestic ACH/Fedwire. For international incoming wires, our SWIFT/BIC code is SCIBUS33XXX. You can find full wire instructions in the Accounts section.",
            "suggest_ticket": False,
            "suggested_subject": "Wire Transfer Routing Inquiry",
            "suggested_category": "Transfers"
        }

    # 2. Account Balance & Statements
    elif any(w in q for w in ["balance", "statement", "statements", "download statement", "tax document", "1099"]):
        return {
            "reply": "You can view your real-time balances, available funds, transaction histories, and download monthly statements directly in the 'Accounts' section. Official tax documents (1099-INT) are generated annually in the Statements tab.",
            "suggest_ticket": False,
            "suggested_subject": "Statement & Balance Inquiry",
            "suggested_category": "Accounts"
        }

    # 3. Transfer Limits
    elif any(w in q for w in ["transfer limit", "daily limit", "wire limit", "limits", "maximum transfer", "how much can i send"]):
        return {
            "reply": "Daily transfer limits depend on your account tier and KYC tier. Standard accounts have a default daily wire limit of $50,000. Would you like to request a temporary or permanent transfer limit increase?",
            "suggest_ticket": True,
            "suggested_subject": "Transfer Limit Increase Request",
            "suggested_category": "Transfers"
        }

    # 4. Transfer Fees
    elif any(w in q for w in ["transfer fee", "wire fee", "charges", "cost", "fee", "how much fee"]):
        return {
            "reply": "Internal BNB-to-BNB account transfers are 100% free ($0.00). Standard domestic wires are $2.50, and international SWIFT transfers are $25.00 with real-time treasury FX rates.",
            "suggest_ticket": False,
            "suggested_subject": "Transfer Fee Inquiry",
            "suggested_category": "Transfers"
        }

    # 5. Security Restrictions / Account Lock / Banned / Suspended
    elif any(w in q for w in ["ban", "banned", "restricted", "restriction", "freeze", "lock", "locked", "suspended", "hold", "blocked"]):
        return {
            "reply": "If your account, transfer, or withdrawal is currently under security or compliance review, our risk operations team reviews active cases 24/7. Would you like me to open an expedited priority support ticket for case resolution?",
            "suggest_ticket": True,
            "suggested_subject": "Account Security & Restriction Review",
            "suggested_category": "Login & Security"
        }

    # 6. Card Security & Replacements
    elif any(w in q for w in ["card", "lost card", "stolen card", "virtual card", "debit card", "freeze card", "replace card", "new card"]):
        return {
            "reply": "You can instantly freeze or unfreeze your physical and virtual cards in the 'Cards' tab. For lost or stolen cards, freeze the card immediately to prevent unauthorized activity. Would you like to submit an official card replacement request?",
            "suggest_ticket": True,
            "suggested_subject": "Card Replacement / Dispute Request",
            "suggested_category": "Cards & Wallets"
        }

    # 7. PIN & 2FA / Password Reset
    elif any(w in q for w in ["pin", "transfer pin", "reset pin", "forgot pin", "2fa", "two factor", "otp", "password", "reset password"]):
        return {
            "reply": "You can reset your Transfer PIN under Profile -> Security -> Transfer PIN using your OTP verification. For login passwords, use the 'Forgot Password' link on the sign-in screen. Would you like direct assistance with security verification?",
            "suggest_ticket": True,
            "suggested_subject": "Security Verification & PIN Assistance",
            "suggested_category": "Login & Security"
        }

    # 8. Loan Products & APR
    elif any(w in q for w in ["loan", "credit", "borrow", "interest rate", "mortgage", "apr", "personal loan", "business loan"]):
        return {
            "reply": "We offer Personal Loans (from 4.5% APR), Auto Express Financing (from 5.5% APR), and Business Growth Facilities (from 7.5% APR) with terms up to 84 months. You can calculate payments and submit an instant application under the 'Loans' menu.",
            "suggest_ticket": False,
            "suggested_subject": "Loan Product Inquiry",
            "suggested_category": "Loans & Credit"
        }

    # 9. Check Deposits & Mobile Check Cashing
    elif any(w in q for w in ["deposit", "check deposit", "cheque", "mobile deposit", "cash check", "direct deposit"]):
        return {
            "reply": "You can submit check deposits and review clearing statuses under the 'Deposits' tab. Standard check verification takes 1-2 business days. Direct deposits and payroll ACH clear automatically on the settlement date.",
            "suggest_ticket": False,
            "suggested_subject": "Deposit & Check Inquiry",
            "suggested_category": "Accounts"
        }

    # 10. Bill Payments & Scheduled Payments
    elif any(w in q for w in ["bill", "bill payment", "payee", "utility", "scheduled payment", "recurring payment"]):
        return {
            "reply": "You can manage electronic bill payments and recurring schedules in the 'Bills' section. Over 10,000 national billers are supported with same-day electronic clearing.",
            "suggest_ticket": False,
            "suggested_subject": "Bill Payment Support",
            "suggested_category": "Payments"
        }

    # 11. Transaction Dispute / Unauthorized Charge
    elif any(w in q for w in ["dispute", "unauthorized", "fraud", "stolen money", "chargeback", "wrong charge", "scam"]):
        return {
            "reply": "Our fraud prevention unit protects all customer accounts under Zero-Liability protection. If you notice an unauthorized charge, we recommend freezing the affected account or card immediately. Would you like me to open an urgent fraud dispute ticket?",
            "suggest_ticket": True,
            "suggested_subject": "Urgent Transaction Dispute / Fraud Report",
            "suggested_category": "Login & Security"
        }

    # 12. Beneficiaries & Wire Recipients
    elif any(w in q for w in ["beneficiary", "beneficiaries", "recipient", "add contact", "save contact"]):
        return {
            "reply": "You can add, edit, or remove saved transfer beneficiaries during any transfer checkout under 'Saved Beneficiaries'. Frequent recipients are saved automatically for quick transfers.",
            "suggest_ticket": False,
            "suggested_subject": "Beneficiary Management Inquiry",
            "suggested_category": "Transfers"
        }

    # 13. Profile & Contact Info Update
    elif any(w in q for w in ["address", "phone number", "change email", "update phone", "update address", "personal info"]):
        return {
            "reply": "You can update your residential address, phone number, and notification preferences under Profile -> Personal Info. For primary email or legal name changes, security documentation may be required.",
            "suggest_ticket": True,
            "suggested_subject": "Account Information Update Request",
            "suggested_category": "Profile & Settings"
        }

    # 14. Human Agent / Direct Escalation / Support Ticket
    elif any(w in q for w in ["human", "agent", "advisor", "representative", "specialist", "ticket", "support team", "speak to someone", "call me", "manager"]):
        return {
            "reply": "Our relationship managers and support specialists are active 24/7. Would you like me to open an official Support Ticket right now to connect you with an assigned specialist?",
            "suggest_ticket": True,
            "suggested_subject": "Assistance Request - Relationship Manager",
            "suggested_category": "General"
        }

    # 15. Greetings
    elif any(w in q for w in ["hi", "hello", "hey", "good morning", "good afternoon", "good evening"]):
        return {
            "reply": "Hello! Welcome to BNB 24/7 Digital Banking Support. How may I assist you today with your accounts, transfers, loans, cards, or security settings?",
            "suggest_ticket": False,
            "suggested_subject": "General Inquiry",
            "suggested_category": "General"
        }

    # 16. Fallback
    else:
        return {
            "reply": "Thank you for contacting Broadmont Support. I have logged your question. Would you like me to create an official support ticket so our team can investigate and follow up with you directly?",
            "suggest_ticket": True,
            "suggested_subject": query[:60] if len(query) > 3 else "Client Support Request",
            "suggested_category": "General"
        }


INACTIVITY_TIMEOUT_MINUTES = 15


@router.post("/chat/start")
async def start_chat(
    current_user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """Start chat with automated assistant & relationship manager (resets on 15m inactivity)"""
    cutoff = datetime.utcnow() - timedelta(minutes=INACTIVITY_TIMEOUT_MINUTES)
    
    # Check if there is an active chat session that had activity within the last 15 minutes
    existing_res = await db.execute(
        select(Chat).where(Chat.user_id == current_user_id, Chat.status == "active").order_by(Chat.created_at.desc())
    )
    existing_chats = existing_res.scalars().all()
    
    for old_chat in existing_chats:
        # Check last message timestamp
        last_msg_res = await db.execute(
            select(ChatMessage).where(ChatMessage.chat_id == old_chat.id).order_by(ChatMessage.created_at.desc()).limit(1)
        )
        last_msg = last_msg_res.scalar_one_or_none()
        last_activity = last_msg.created_at if last_msg else old_chat.created_at
        
        if last_activity < cutoff:
            # Inactivity expired: close old session
            old_chat.status = "closed"
            old_chat.closed_at = datetime.utcnow()
        else:
            # Still active within 15 minutes window
            await db.commit()
            return {
                "success": True,
                "data": {"chat_id": old_chat.id},
                "message": "Existing active chat session resumed"
            }

    new_chat = Chat(
        id=str(uuid.uuid4()),
        user_id=current_user_id,
        status="active",
        created_at=datetime.utcnow()
    )
    db.add(new_chat)

    # Initial welcome message from automated assistant
    welcome_msg = ChatMessage(
        id=str(uuid.uuid4()),
        chat_id=new_chat.id,
        user_id=current_user_id,
        sender_id="bnb-assistant",
        message="Hello! Welcome to Broadmont National Bank 24/7 Digital Support. How can we assist you today?",
        is_from_agent=True,
        created_at=datetime.utcnow()
    )
    db.add(welcome_msg)
    await db.commit()
    
    return {
        "success": True,
        "data": {"chat_id": new_chat.id},
        "message": "Chat session started"
    }


@router.post("/chat/{chat_id}/message")
async def send_chat_message(
    chat_id: str,
    message: str = Body(..., embed=True),
    current_user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """Send message in chat and generate automated assistant response"""
    chat_result = await db.execute(select(Chat).where(Chat.id == chat_id))
    chat = chat_result.scalar_one_or_none()
    if not chat or chat.user_id != current_user_id:
        raise HTTPException(status_code=404, detail="Chat not found")

    clean_user_msg = message.strip()
    new_message = ChatMessage(
        id=str(uuid.uuid4()),
        chat_id=chat_id,
        user_id=current_user_id,
        sender_id=current_user_id,
        message=clean_user_msg,
        is_from_agent=False,
        created_at=datetime.utcnow()
    )
    db.add(new_message)

    # Generate automated assistant reply
    auto_res = _generate_auto_assistant_response(clean_user_msg)
    assistant_reply = auto_res["reply"]
    
    auto_message = ChatMessage(
        id=str(uuid.uuid4()),
        chat_id=chat_id,
        user_id=current_user_id,
        sender_id="bnb-assistant",
        message=assistant_reply,
        is_from_agent=True,
        created_at=datetime.utcnow()
    )
    db.add(auto_message)
    await db.commit()
    
    return {
        "success": True,
        "data": {
            "user_message_id": new_message.id,
            "assistant_message_id": auto_message.id,
            "assistant_reply": assistant_reply,
            "suggest_ticket": auto_res.get("suggest_ticket", False),
            "suggested_subject": auto_res.get("suggested_subject", "Client Support Inquiry"),
            "suggested_category": auto_res.get("suggested_category", "General")
        },
        "message": "Message processed"
    }


class ChatCreateTicketRequest(BaseModel):
    subject: str = Field(..., min_length=3, max_length=160)
    description: str = Field(..., min_length=3, max_length=4000)
    category: str | None = "General"
    priority: str = "medium"


@router.post("/chat/{chat_id}/create-ticket")
async def chat_create_support_ticket(
    chat_id: str,
    request: ChatCreateTicketRequest,
    background_tasks: BackgroundTasks,
    current_user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """Create a support ticket directly from the automated chat session and notify support & user"""
    import random, string
    u_res = await db.execute(select(User).where(User.id == current_user_id))
    user = u_res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user_name = f"{user.first_name} {user.last_name}".strip() or "Valued Client"
    user_email = user.email

    ticket_num = 'TKT' + ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))
    new_ticket = SupportTicket(
        id=str(uuid.uuid4()),
        user_id=current_user_id,
        ticket_number=ticket_num,
        subject=request.subject.strip(),
        description=request.description.strip(),
        category=request.category or "General",
        priority=request.priority or "medium",
        status="open",
        created_at=datetime.utcnow()
    )
    db.add(new_ticket)

    confirmation_text = f"Support Case #{ticket_num} has been created. An official confirmation receipt has been sent to your email ({user_email}). A dedicated relationship manager will review your request and follow up shortly."
    chat_msg = ChatMessage(
        id=str(uuid.uuid4()),
        chat_id=chat_id,
        user_id=current_user_id,
        sender_id="bnb-assistant",
        message=confirmation_text,
        is_from_agent=True,
        created_at=datetime.utcnow()
    )
    db.add(chat_msg)
    await db.commit()

    # Dispatch background notification emails to support@broadmontnationalb.com AND client receipt
    background_tasks.add_task(
        _send_ticket_created_email,
        user_name,
        user_email,
        ticket_num,
        request.subject,
        request.description,
        request.category,
        request.priority
    )

    try:
        AblyRealtimeManager.publish_admin_event("support", {"type": "ticket_created", "ticket_id": new_ticket.id})
    except Exception:
        pass

    return {
        "success": True,
        "data": {
            "ticket_id": new_ticket.id,
            "ticket_number": ticket_num,
            "confirmation_message": confirmation_text
        },
        "message": f"Ticket #{ticket_num} created successfully"
    }


@router.get("/chat/{chat_id}/messages")
async def get_chat_messages(
    chat_id: str,
    limit: int = Query(50),
    current_user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """Get chat messages"""
    chat_result = await db.execute(select(Chat).where(Chat.id == chat_id))
    chat = chat_result.scalar()
    if not chat or chat.user_id != current_user_id:
        raise HTTPException(status_code=404, detail="Chat not found")

    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.chat_id == chat_id)
        .order_by(ChatMessage.created_at.desc())
        .limit(limit)
    )
    messages = result.scalars().all()
    
    return {
        "success": True,
        "data": [
            {
                "id": m.id,
                "sender_id": m.sender_id,
                "message": m.message,
                "is_from_agent": m.is_from_agent,
                "created_at": m.created_at.isoformat() + 'Z'
            }
            for m in messages
        ],
        "message": "Chat messages retrieved"
    }


@router.get("/chats")
async def get_chats(
    current_user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """Get all chat sessions"""
    result = await db.execute(
        select(Chat)
        .where(Chat.user_id == current_user_id)
        .order_by(Chat.created_at.desc())
    )
    chats = result.scalars().all()
    
    return {
        "success": True,
        "data": [
            {
                "id": c.id,
                "status": c.status,
                "created_at": c.created_at.isoformat() + 'Z'
            }
            for c in chats
        ],
        "message": "Chat sessions retrieved"
    }


def _format_email_body_with_images(text: str) -> str:
    """Helper to convert plain text messages and Cloudinary screenshot URLs into styled HTML with embedded images"""
    if not text:
        return ""
    img_regex = r'(https?://[^\s]+\.(?:png|jpg|jpeg|webp|gif)(?:\?[^\s]*)?|https://res\.cloudinary\.com/[^\s]+)'
    urls = re.findall(img_regex, text, re.IGNORECASE)
    clean_text = re.sub(img_regex, '', text, flags=re.IGNORECASE).replace("Attachment:", "").strip()

    html = f'<div style="font-size:14px; color:#1E293B; line-height:1.6; white-space:pre-wrap;">{clean_text}</div>' if clean_text else ''
    if urls:
        html += '<div style="margin-top:14px;">'
        for u in urls:
            html += f'''
              <div style="margin-bottom:14px;">
                <a href="{u}" target="_blank" style="display:inline-block;">
                  <img src="{u}" alt="Attachment Screenshot" style="max-width:100%; max-height:420px; border-radius:8px; border:1px solid #CBD5E1; box-shadow:0 1px 3px rgba(0,0,0,0.08);" />
                </a>
                <div style="font-size:11px; margin-top:4px;">
                  <a href="{u}" target="_blank" style="color:#0056B3; text-decoration:none; font-weight:600;">Open image in high resolution ↗</a>
                </div>
              </div>
            '''
        html += '</div>'
    return html or f'<div style="font-size:14px; color:#1E293B; line-height:1.6; white-space:pre-wrap;">{text}</div>'


def _send_ticket_created_email(user_name: str, user_email: str, ticket_number: str, subject: str, description: str, category: str | None, priority: str):
    """Internal helper to send ticket notification to support@broadmontnationalb.com AND receipt to user"""
    try:
        desc_html = _format_email_body_with_images(description)

        # 1. Dispatch email alert to support team
        support_subject = f"[Case Reference #{ticket_number}] {subject}"
        support_body = f"""
          <p style="margin:0 0 16px 0; font-size:14px; color:#475569;">An official customer inquiry has been registered in the secure banking support portal.</p>
          
          <table style="width:100%; border-collapse:collapse; margin-bottom:24px; font-size:14px;">
            <tr style="border-bottom:1px solid #E2E8F0;">
              <td style="padding:10px 0; font-weight:600; color:#475569; width:140px;">Case Reference</td>
              <td style="padding:10px 0; color:#0F172A; font-weight:700;">#{ticket_number}</td>
            </tr>
            <tr style="border-bottom:1px solid #E2E8F0;">
              <td style="padding:10px 0; font-weight:600; color:#475569;">Client Name</td>
              <td style="padding:10px 0; color:#0F172A; font-weight:600;">{user_name}</td>
            </tr>
            <tr style="border-bottom:1px solid #E2E8F0;">
              <td style="padding:10px 0; font-weight:600; color:#475569;">Classification</td>
              <td style="padding:10px 0; color:#0F172A;">{category or 'General Banking'}</td>
            </tr>
            <tr style="border-bottom:1px solid #E2E8F0;">
              <td style="padding:10px 0; font-weight:600; color:#475569;">Priority Level</td>
              <td style="padding:10px 0; color:#0F172A; text-transform:capitalize;">{priority or 'Standard'}</td>
            </tr>
            <tr style="border-bottom:1px solid #E2E8F0;">
              <td style="padding:10px 0; font-weight:600; color:#475569;">Subject</td>
              <td style="padding:10px 0; color:#0F172A; font-weight:600;">{subject}</td>
            </tr>
          </table>

          <div style="background:#F8FAFC; border-left:4px solid #0056B3; padding:16px; border-radius:4px; margin-bottom:20px;">
            <div style="font-size:12px; font-weight:700; color:#0056B3; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px;">Customer Inquiry Summary</div>
            {desc_html}
          </div>
        """
        support_html = email_service._wrap_html(f"Service Request #{ticket_number}", support_body)
        
        email_service.send_custom_email(
            to_email="support@broadmontnationalb.com",
            subject=support_subject,
            html_content=support_html,
            reply_to=user_email
        )

        # 2. Dispatch receipt confirmation to client
        if user_email:
            client_subject = f"[Case Reference #{ticket_number}] Service Request Confirmation: {subject}"
            client_body = f"""
              <p style="margin-top:0;">Dear Valued Client,</p>
              <p>Thank you for contacting Broadmont National Bank. Your service request has been logged under Case Reference <strong>#{ticket_number}</strong>.</p>
              
              <table style="width:100%; border-collapse:collapse; margin:20px 0; font-size:14px;">
                <tr style="border-bottom:1px solid #E2E8F0;">
                  <td style="padding:10px 0; font-weight:600; color:#475569; width:140px;">Case Reference</td>
                  <td style="padding:10px 0; color:#0F172A; font-weight:700;">#{ticket_number}</td>
                </tr>
                <tr style="border-bottom:1px solid #E2E8F0;">
                  <td style="padding:10px 0; font-weight:600; color:#475569;">Classification</td>
                  <td style="padding:10px 0; color:#0F172A;">{category or 'General Banking'}</td>
                </tr>
                <tr style="border-bottom:1px solid #E2E8F0;">
                  <td style="padding:10px 0; font-weight:600; color:#475569;">Subject</td>
                  <td style="padding:10px 0; color:#0F172A; font-weight:600;">{subject}</td>
                </tr>
              </table>

              <div style="background:#F8FAFC; border-left:4px solid #0056B3; padding:16px; border-radius:4px; margin-bottom:24px;">
                <div style="font-size:12px; font-weight:700; color:#0056B3; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px;">Description of Request</div>
                {desc_html}
              </div>

              <p>A client service specialist has been assigned to your case and will respond promptly. You can monitor the progress of your inquiry at any time via the Support Center.</p>
              
              <div style="background:#FFF7ED; border:1px solid #FFEDD5; border-left:4px solid #EA580C; padding:12px 16px; border-radius:6px; margin-top:24px;">
                <p style="margin:0; font-size:13px; color:#C2410C; line-height:1.5; font-weight:600;">
                  Security Reminder: Broadmont National Bank will never request your account password, transfer PIN, or multi-factor authentication codes via email.
                </p>
              </div>
            """
            client_html = email_service._wrap_html(f"Case Confirmation #{ticket_number}", client_body)
            email_service.send_custom_email(
                to_email=user_email,
                subject=client_subject,
                html_content=client_html
            )
    except Exception as e:
        logger.error(f"Error sending ticket notification email to support: {e}")


# Support ticket endpoints
@router.post("/upload-attachment")
async def upload_support_attachment(
    file: UploadFile = File(...),
    current_user_id: str = Depends(get_current_user_id)
):
    """Upload a support screenshot / attachment to Cloudinary and return secure URL"""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    
    file_bytes = await file.read()
    if len(file_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File exceeds 10MB limit")
        
    try:
        import cloudinary.uploader
        result = cloudinary.uploader.upload(
            file_bytes,
            folder="support_attachments",
            resource_type="auto"
        )
        return {
            "success": True,
            "data": {
                "url": result.get("secure_url") or result.get("url"),
                "public_id": result.get("public_id"),
                "format": result.get("format")
            }
        }
    except Exception as e:
        logger.error(f"Cloudinary support upload error: {e}")
        raise HTTPException(status_code=500, detail="Failed to upload attachment")


@router.post("/tickets")
async def create_support_ticket(
    request: CreateTicketRequest,
    background_tasks: BackgroundTasks,
    current_user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """Create support ticket with automated advisor greeting, in-app notification, and real-time broadcast"""
    now_dt = datetime.utcnow()
    desc = request.description.strip()
    if request.attachment_url:
        desc = f"{desc}\n\nAttachment: {request.attachment_url}"

    new_ticket = SupportTicket(
        id=str(uuid.uuid4()),
        user_id=current_user_id,
        ticket_number=f"TKT{str(uuid.uuid4())[:8].upper()}",
        subject=request.subject.strip(),
        description=desc,
        category=request.category,
        priority=request.priority,
        status="open",
        created_at=now_dt
    )
    db.add(new_ticket)

    # 1. Instant Automated Support Greeting Message
    greeting_msg = TicketMessage(
        id=str(uuid.uuid4()),
        ticket_id=new_ticket.id,
        sender_id="system-support",
        is_from_staff=True,
        message=(
            f"Thank you for contacting Broadmont National International Support. Your inquiry has been registered under Case Reference #{new_ticket.ticket_number}.\n\n"
            f"A support advisor will respond within 1 to 24 hours. You can add details or attachments to this thread.\n\n"
            f"If you don't hear back or need urgent help, email support@broadmontnationalb.com and reference your case number #{new_ticket.ticket_number}.\n\n"
            f"For your security, never share your full card number, PIN, password, or one-time passcodes here or with anyone claiming to represent us."
        ),
        created_at=now_dt
    )
    db.add(greeting_msg)

    # 2. In-App Notification Record in Database
    notif = Notification(
        id=str(uuid.uuid4()),
        user_id=current_user_id,
        type=NotificationType.SYSTEM,
        title=f"Support Ticket #{new_ticket.ticket_number} Created",
        message=f"Your inquiry regarding '{new_ticket.subject}' has been registered.",
        action_url="/dashboard/support"
    )
    db.add(notif)
    await db.commit()

    # Get user details for background notification email
    user_result = await db.execute(select(User).where(User.id == current_user_id))
    user = user_result.scalar_one_or_none()
    user_name = f"{user.first_name} {user.last_name}" if user else "Authenticated Client"
    user_email = user.email if user else "client@broadmontnationalb.com"

    # 3. Background Email Alerts
    background_tasks.add_task(
        _send_ticket_created_email,
        user_name,
        user_email,
        new_ticket.ticket_number,
        new_ticket.subject,
        new_ticket.description,
        new_ticket.category,
        new_ticket.priority
    )

    # 4. Ably Real-Time In-App Notification & Admin Broadcast
    try:
        AblyRealtimeManager.publish_notification(
            current_user_id,
            "support",
            f"Support Ticket #{new_ticket.ticket_number} Created",
            f"Your inquiry regarding '{new_ticket.subject}' has been registered.",
            {"ticket_id": new_ticket.id, "ticket_number": new_ticket.ticket_number}
        )
        AblyRealtimeManager.publish_admin_event("support", {"type": "ticket_created", "ticket_id": new_ticket.id, "ticket_number": new_ticket.ticket_number})
    except Exception:
        pass

    return {
        "success": True,
        "data": {
            "id": new_ticket.id,
            "ticket_number": new_ticket.ticket_number,
            "subject": new_ticket.subject,
            "category": new_ticket.category,
            "priority": new_ticket.priority,
            "status": new_ticket.status,
            "created_at": now_dt.isoformat()
        },
        "message": "Support ticket created successfully"
    }

# Backward-compatible form variant (deprecated)
@router.post("/ticket")
async def create_support_ticket_legacy(
    subject: str,
    description: str,
    category: str | None = None,
    priority: str = "medium",
    current_user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    req = CreateTicketRequest(subject=subject, description=description, category=category, priority=priority)
    return await create_support_ticket(req, current_user_id, db)


@router.get("/tickets")
async def get_support_tickets(
    limit: int = Query(20),
    current_user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """Get user support tickets"""
    result = await db.execute(
        select(SupportTicket)
        .where(SupportTicket.user_id == current_user_id)
        .order_by(SupportTicket.created_at.desc())
        .limit(limit)
    )
    tickets = result.scalars().all()
    
    return {
        "success": True,
        "data": [
            {
                "id": t.id,
                "ticket_number": t.ticket_number,
                "subject": t.subject,
                "category": t.category,
                "status": t.status,
                "priority": t.priority,
                "created_at": t.created_at.isoformat() + 'Z'
            }
            for t in tickets
        ],
        "message": "Support tickets retrieved"
    }


@router.get("/tickets/{ticket_id}")
async def get_support_ticket_detail(
    ticket_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """Get a single support ticket detail for the current user"""
    res = await db.execute(select(SupportTicket).where(SupportTicket.id == ticket_id))
    t = res.scalar_one_or_none()
    if not t or t.user_id != current_user_id:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return {
        "success": True,
        "data": {
            "id": t.id,
            "ticket_number": t.ticket_number,
            "subject": t.subject,
            "description": t.description,
            "category": t.category,
            "status": t.status,
            "priority": t.priority,
            "created_at": t.created_at.isoformat() + 'Z'
        }
    }


class TicketReplyRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)


@router.get("/tickets/{ticket_id}/replies")
async def get_ticket_replies(
    ticket_id: str,
    limit: int = Query(100),
    current_user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """Get conversation for a ticket"""
    res = await db.execute(select(SupportTicket).where(SupportTicket.id == ticket_id))
    t = res.scalar_one_or_none()
    if not t or t.user_id != current_user_id:
        raise HTTPException(status_code=404, detail="Ticket not found")
    msgs_res = await db.execute(
        select(TicketMessage)
        .where(TicketMessage.ticket_id == ticket_id)
        .order_by(TicketMessage.created_at.asc())
        .limit(limit)
    )
    msgs = msgs_res.scalars().all()
    # Resolve author names for user and any staff members
    authors: dict[str, str] = {}
    # User author
    u_res = await db.execute(select(User).where(User.id == t.user_id))
    u = u_res.scalar_one_or_none()
    if u:
        authors[u.id] = (f"{u.first_name} {u.last_name}".strip() or u.email)
    # Possible admin authors
    admin_ids = list({m.sender_id for m in msgs if m.is_from_staff})
    for a_id in admin_ids:
        authors[a_id] = "Broadmont Support"
    return {
        "success": True,
        "data": [
            {
                "id": m.id,
                "author_id": m.sender_id,
                "author_name": "Broadmont Support" if m.is_from_staff else (authors.get(m.sender_id) or "You"),
                "message": m.message,
                "is_from_staff": m.is_from_staff,
                "created_at": m.created_at.isoformat() + 'Z'
            } for m in msgs
        ]
    }


def _send_user_reply_notification(user_name: str, user_email: str, ticket_number: str, ticket_subject: str, message: str):
    """Internal helper to dispatch user's dashboard ticket reply to support@broadmontnationalb.com with embedded screenshot images"""
    try:
        msg_html = _format_email_body_with_images(message)
        subject = f"Re: [Case Reference #{ticket_number}] {ticket_subject}"
        body = f"""
          <p style="margin:0 0 16px 0; font-size:14px; color:#475569;">A customer response has been submitted on Case Reference <strong>#{ticket_number}</strong>.</p>
          
          <table style="width:100%; border-collapse:collapse; margin-bottom:24px; font-size:14px;">
            <tr style="border-bottom:1px solid #E2E8F0;">
              <td style="padding:10px 0; font-weight:600; color:#475569; width:140px;">Case Reference</td>
              <td style="padding:10px 0; color:#0F172A; font-weight:700;">#{ticket_number}</td>
            </tr>
            <tr style="border-bottom:1px solid #E2E8F0;">
              <td style="padding:10px 0; font-weight:600; color:#475569;">Sender Name</td>
              <td style="padding:10px 0; color:#0F172A; font-weight:600;">{user_name}</td>
            </tr>
            <tr style="border-bottom:1px solid #E2E8F0;">
              <td style="padding:10px 0; font-weight:600; color:#475569;">Inquiry Topic</td>
              <td style="padding:10px 0; color:#0F172A; font-weight:600;">{ticket_subject}</td>
            </tr>
          </table>

          <div style="background:#F8FAFC; border-left:4px solid #0056B3; padding:16px; border-radius:4px; margin-bottom:20px;">
            <div style="font-size:12px; font-weight:700; color:#0056B3; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px;">Customer Correspondence</div>
            {msg_html}
          </div>
        """
        html_content = email_service._wrap_html(f"Service Request Correspondence #{ticket_number}", body)
        email_service.send_custom_email(
            to_email="support@broadmontnationalb.com",
            subject=subject,
            html_content=html_content,
            reply_to=user_email
        )
    except Exception as e:
        logger.error(f"Error sending ticket reply notification to support: {e}")


@router.post("/tickets/{ticket_id}/replies")
async def post_ticket_reply(
    ticket_id: str,
    request: TicketReplyRequest,
    background_tasks: BackgroundTasks,
    current_user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """Post a reply from the user to a ticket"""
    res = await db.execute(select(SupportTicket).where(SupportTicket.id == ticket_id))
    t = res.scalar_one_or_none()
    if not t or t.user_id != current_user_id:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if t.status in ("resolved", "closed"):
        raise HTTPException(
            status_code=400,
            detail="This support request has been resolved and closed. Please create a new support ticket for further assistance."
        )
    msg = TicketMessage(
        id=str(uuid.uuid4()),
        ticket_id=t.id,
        sender_id=current_user_id,
        is_from_staff=False,
        message=request.message,
        created_at=datetime.utcnow(),
    )
    db.add(msg)
    t.status = "open"

    # Fetch user for email dispatch
    u_res = await db.execute(select(User).where(User.id == current_user_id))
    u = u_res.scalar_one_or_none()
    user_name = f"{u.first_name} {u.last_name}" if u else "Client"
    user_email = u.email if u else "client@broadmontnationalb.com"

    background_tasks.add_task(
        _send_user_reply_notification,
        user_name,
        user_email,
        t.ticket_number,
        t.subject,
        request.message
    )

    try:
        AblyRealtimeManager.publish_admin_event("support", {"type": "ticket_user_replied", "ticket_id": t.id, "reply_id": msg.id})
        AblyRealtimeManager.publish_support_message(t.id, current_user_id, user_name, request.message.strip(), False)
    except Exception:
        pass
    await db.commit()
    return {"success": True, "data": {"id": msg.id}}


class UserTypingRequest(BaseModel):
    is_typing: bool = True


@router.post("/tickets/{ticket_id}/typing")
async def user_ticket_typing(
    ticket_id: str,
    request: UserTypingRequest,
    current_user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """Publish real-time typing indicator from client user"""
    u_res = await db.execute(select(User).where(User.id == current_user_id))
    u = u_res.scalar_one_or_none()
    sender_name = f"{u.first_name} {u.last_name}".strip() if u else "Client"
    try:
        AblyRealtimeManager.publish_typing_indicator(ticket_id, sender_name, request.is_typing)
    except Exception:
        pass
    return {"success": True}


def _clean_email_reply_body(text: str) -> str:
    """Strip quoted lines, signatures, and automated alert headers from email replies."""
    if not text:
        return ""
    import re
    lines = []
    for line in text.splitlines():
        # Stop at quoted text markers or automated headers
        if re.match(r"^\s*On\s+.*wrote:\s*$", line, re.IGNORECASE) or \
           re.match(r"^\s*-----\s*Original Message\s*-----\s*$", line, re.IGNORECASE) or \
           re.match(r"^\s*From:\s+.*", line, re.IGNORECASE) or \
           re.match(r"^\s*Sent:\s+.*", line, re.IGNORECASE) or \
           re.match(r"^\s*Subject:\s+.*", line, re.IGNORECASE) or \
           re.search(r"BNB NEW TICKET", line, re.IGNORECASE) or \
           re.search(r"Ticket Ref:\s*#TKT", line, re.IGNORECASE):
            break
        # Skip blockquote lines
        if line.strip().startswith(">"):
            continue
        # Skip automated header lines
        if re.match(r"^\s*User:\s+.*", line, re.IGNORECASE) or \
           re.match(r"^\s*Priority:\s+.*", line, re.IGNORECASE) or \
           re.match(r"^\s*Category:\s+.*", line, re.IGNORECASE):
            continue
        lines.append(line)
    cleaned = "\n".join(lines).strip()
    return cleaned


class InboundEmailWebhookRequest(BaseModel):
    from_email: str
    subject: str
    body_text: str | None = None
    body_html: str | None = None


@router.post("/inbound-email")
async def handle_inbound_support_email(
    request: InboundEmailWebhookRequest,
    db: AsyncSession = Depends(get_db)
):
    """Handle incoming email replies sent to support@broadmontnationalb.com and append them to user tickets."""
    import re
    subject = request.subject or ""
    raw_body = (request.body_text or request.body_html or "").strip()
    body = _clean_email_reply_body(raw_body)
    from_email = (request.from_email or "").strip().lower()

    # Search for TKT ticket reference in subject or body
    match = re.search(r"TKT[A-Z0-9]{8}", subject, re.IGNORECASE) or re.search(r"TKT-[A-Z0-9]+", subject, re.IGNORECASE)
    
    ticket = None
    if match:
        tkt_ref = match.group(0).upper().replace("-", "")
        res = await db.execute(select(SupportTicket).where(SupportTicket.ticket_number.ilike(f"%{tkt_ref}%")))
        ticket = res.scalar_one_or_none()

    if ticket:
        user_res = await db.execute(select(User).where(User.id == ticket.user_id))
        user = user_res.scalar_one_or_none()
        
        is_staff = from_email == "support@broadmontnationalb.com" or "admin" in from_email or (user and from_email != user.email.lower())
        sender_id = ticket.user_id if not is_staff else "support-agent"
        
        msg = TicketMessage(
            id=str(uuid.uuid4()),
            ticket_id=ticket.id,
            sender_id=sender_id,
            is_from_staff=is_staff,
            message=body,
            created_at=datetime.utcnow()
        )
        db.add(msg)
        if is_staff:
            ticket.status = "in_progress"
            if user:
                email_service.send_support_ticket_reply(user.email, ticket.ticket_number, ticket.subject, body)
        else:
            ticket.status = "open"
            email_service.send_custom_email(
                to_email="support@broadmontnationalb.com",
                subject=f"Re: [Ticket #{ticket.ticket_number}] {ticket.subject}",
                html_content=email_service._wrap_html("New Email Reply", f"<p>Client replied via email:</p><div style='padding:12px;background:#F8FAFC;'>{body}</div>"),
                reply_to=user.email if user else from_email
            )
        await db.commit()
        return {"success": True, "message": f"Reply added to ticket #{ticket.ticket_number}"}
    else:
        # Create new ticket for this client email
        user_res = await db.execute(select(User).where(User.email.ilike(from_email)))
        user = user_res.scalar_one_or_none()
        
        if user:
            new_ticket = SupportTicket(
                id=str(uuid.uuid4()),
                user_id=user.id,
                ticket_number=f"TKT{str(uuid.uuid4())[:8].upper()}",
                subject=subject or "Email Inquiry",
                description=body or "Inquiry received via email",
                category="General",
                priority="medium",
                status="open",
                created_at=datetime.utcnow()
            )
            db.add(new_ticket)
            await db.commit()
            
            _send_ticket_created_email(f"{user.first_name} {user.last_name}", user.email, new_ticket.ticket_number, new_ticket.subject, body, "General", "medium")
            return {"success": True, "message": f"New ticket #{new_ticket.ticket_number} created from email"}
            
        return {"success": False, "message": "No matching ticket or user found for inbound email"}


def _send_contact_email(request: ContactFormRequest):
    """Internal helper to send the contact email in background"""
    try:
        # Build email content
        subject = f"Contact Form: {request.subject}"
        phone_info = f"<p><strong>Phone:</strong> {request.phone}</p>" if request.phone else ""
        body = f"""
          <p>You have received a new message from the public contact form:</p>
          <div style="margin:16px 0;padding:16px;border:1px solid #E5E7EB;border-radius:8px;background:#F9FAFB;">
            <p><strong>From:</strong> {request.fullName} ({request.email})</p>
            {phone_info}
            <p><strong>Subject:</strong> {request.subject}</p>
            <p><strong>Message:</strong></p>
            <p style="white-space: pre-wrap;">{request.message}</p>
          </div>
          <p>Please respond to the client at <strong>{request.email}</strong> as soon as possible.</p>
        """
        html_content = email_service._wrap_html("New Contact Inquiry", body)
        
        # Send email to support@broadmontnationalb.com
        success = email_service.send_custom_email(
            to_email="support@broadmontnationalb.com",
            subject=subject,
            html_content=html_content
        )
        
        if not success:
            logger.error("Failed to send contact form email in background")
    except Exception as e:
        logger.error(f"Error in background email task: {e}")


@router.post("/contact")
async def contact_form_submission(
    request: ContactFormRequest,
    background_tasks: BackgroundTasks
):
    """Public contact form submission - sends email to info@broadmontnationalb.com"""
    # Queue the email sending to avoid blocking the request and timing out
    background_tasks.add_task(_send_contact_email, request)
    
    return {
        "success": True,
        "message": "Your message has been received. Our specialized global support team will contact you within 24 hours."
    }
