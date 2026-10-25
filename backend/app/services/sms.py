"""Text messages for phone sign-in codes. Providers: MSG91 (India, DLT-registered template) or Twilio."""
from __future__ import annotations

import base64
import json
import logging
import re
import urllib.parse
import urllib.request

from .. import config
from ..errors import ApiError

log = logging.getLogger("impactbridge")


def normalize_phone(raw: str) -> str:
    """Return +<country><number>. Ten-digit numbers are treated as Indian mobiles."""
    digits = re.sub(r"[^\d+]", "", raw or "")
    if digits.startswith("00"):
        digits = "+" + digits[2:]
    if not digits.startswith("+"):
        d = digits.lstrip("0")
        if len(d) == 10:
            digits = "+91" + d
        elif len(d) == 12 and d.startswith("91"):
            digits = "+" + d
        else:
            digits = "+" + d
    if not re.fullmatch(r"\+\d{8,15}", digits):
        raise ApiError(422, "Enter a valid mobile number, for example 98765 43210.", field="phone")
    if digits.startswith("+91") and not re.fullmatch(r"\+91[6-9]\d{9}", digits):
        raise ApiError(422, "Enter a valid 10-digit Indian mobile number.", field="phone")
    return digits


def send_code(phone: str, code: str) -> bool:
    """Send a sign-in code. Returns False when no SMS provider is configured."""
    s = config.settings
    if not s.sms_configured:
        return False
    try:
        if s.sms_provider == "msg91":
            # MSG91 OTP API; the DLT-approved template must contain the ##OTP## variable.
            q = urllib.parse.urlencode({"template_id": s.msg91_template_id, "mobile": phone.lstrip("+"), "otp": code})
            req = urllib.request.Request(f"https://control.msg91.com/api/v5/otp?{q}", method="POST",
                                         headers={"authkey": s.msg91_auth_key, "Content-Type": "application/json"},
                                         data=b"{}")
            body = json.loads(urllib.request.urlopen(req, timeout=15).read() or b"{}")
            if body.get("type") == "error":
                raise RuntimeError(body.get("message", "MSG91 error"))
        else:
            data = urllib.parse.urlencode({"To": phone, "From": s.twilio_from,
                                           "Body": f"{code} is your ImpactBridge sign-in code. It expires in 10 minutes."}).encode()
            auth = base64.b64encode(f"{s.twilio_sid}:{s.twilio_token}".encode()).decode()
            req = urllib.request.Request(f"https://api.twilio.com/2010-04-01/Accounts/{s.twilio_sid}/Messages.json",
                                         data=data, method="POST", headers={"Authorization": f"Basic {auth}"})
            urllib.request.urlopen(req, timeout=15).read()
        return True
    except Exception as exc:
        log.warning("SMS delivery failed: %s", exc)
        raise ApiError(502, "We couldn't send the text message. Please try again in a minute.")
