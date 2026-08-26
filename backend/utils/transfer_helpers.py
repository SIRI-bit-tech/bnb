from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timedelta
import logging

from models.user import User
from utils.auth import verify_password
from utils.errors import ValidationError, NotFoundError, UnauthorizedError, APIError

logger = logging.getLogger(__name__)

MAX_FAILED_ATTEMPTS = 5
LOCKOUT_DURATION = timedelta(hours=1)

async def _ensure_user_active(db: AsyncSession, user_id: str) -> None:
    from models.user_restriction import UserRestriction, RestrictionType
    
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise NotFoundError(message="User not found")
    if not user.is_active:
        raise UnauthorizedError(message="Account suspended")
    
    # Check for PND restriction
    restriction_result = await db.execute(
        select(UserRestriction).where(
            UserRestriction.user_id == user_id,
            UserRestriction.restriction_type == RestrictionType.POST_NO_DEBIT,
            UserRestriction.is_active == True
        )
    )
    restriction = restriction_result.scalar_one_or_none()
    if restriction:
        # Use custom message if available, otherwise default
        message = restriction.message or "Post No Debit (PND) restriction active on this account."
        
        # Send security notification email to user
        try:
            from services.email import email_service
            import asyncio
            user_name = f"{user.first_name} {user.last_name}".strip()
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.create_task(
                    asyncio.to_thread(
                        email_service.send_account_restriction_alert_email,
                        user.email,
                        user_name,
                        message
                    )
                )
            else:
                email_service.send_account_restriction_alert_email(user.email, user_name, message)
        except Exception as e:
            logger.error(f"Failed to dispatch restriction email to {user.email}: {e}")

        raise APIError(
            status_code=403,
            message=message,
            error_code="POST_NO_DEBIT",
            details={"field": "restriction", "restriction_type": "post_no_debit"}
        )


async def _verify_transfer_pin(db: AsyncSession, user_id: str, transfer_pin: str, consume_otp: bool = True) -> None:
    """Verify user's transfer OTP code (or PIN); raises HTTPException/APIError if invalid."""
    result = await db.execute(
        select(User).where(User.id == user_id).with_for_update()
    )
    user = result.scalar_one_or_none()
    if not user:
        raise NotFoundError(message="User not found")

    now = datetime.utcnow()
    now_ts = now.timestamp()

    # Priority 1: Check dynamic transfer OTP code sent to user email
    if user.transfer_otp_code:
        if user.transfer_otp_expires and user.transfer_otp_expires < now_ts:
            raise ValidationError(
                message="Transfer OTP code has expired. Please click 'Resend Code' to get a new code.",
                details={"field": "transfer_pin"},
            )
        
        # Match OTP code (or static pin fallback)
        is_otp_match = user.transfer_otp_code == transfer_pin.strip()
        is_static_match = user.transfer_pin and verify_password(transfer_pin, user.transfer_pin)

        if not (is_otp_match or is_static_match):
            raise ValidationError(
                message="Invalid transfer PIN",
                details={"field": "transfer_pin"},
            )

        # Success: Invalidate single-use OTP if consume_otp is True
        if consume_otp:
            user.transfer_otp_code = None
            user.transfer_otp_expires = None
        user.transfer_pin_failed_attempts = 0
        user.transfer_pin_locked_until = None
        await db.commit()
        return

    # Priority 2: If static transfer_pin is set
    if user.transfer_pin:
        if user.transfer_pin_locked_until and user.transfer_pin_locked_until > now:
            retry_after = int((user.transfer_pin_locked_until - now).total_seconds())
            raise APIError(
                status_code=423,
                message=f"Transfer authorization locked. Try again in {retry_after} seconds.",
                error_code="PIN_LOCKED",
                details={"field": "transfer_pin", "retry_after": retry_after},
            )

        if not verify_password(transfer_pin, user.transfer_pin):
            user.transfer_pin_failed_attempts = (user.transfer_pin_failed_attempts or 0) + 1
            if user.transfer_pin_failed_attempts >= MAX_FAILED_ATTEMPTS:
                user.transfer_pin_locked_until = now + LOCKOUT_DURATION
                await db.commit()
                retry_after = int(LOCKOUT_DURATION.total_seconds())
                raise APIError(
                    status_code=423,
                    message=f"Transfer authorization locked. Try again in {retry_after} seconds.",
                    error_code="PIN_LOCKED",
                    details={"field": "transfer_pin", "retry_after": retry_after},
                )

            await db.commit()
            raise ValidationError(
                message="Invalid authorization code",
                details={"field": "transfer_pin"},
            )

        # Success: Clear failed attempts
        if user.transfer_pin_failed_attempts or user.transfer_pin_locked_until:
            user.transfer_pin_failed_attempts = 0
            user.transfer_pin_locked_until = None
            await db.commit()
        return

    raise ValidationError(
        message="No transfer OTP found. Please request an OTP code sent to your email.",
        details={"field": "transfer_pin"},
    )

