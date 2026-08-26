from fastapi import Request
from typing import Optional, Dict, Any
import json
import urllib.request
from ipaddress import ip_address, ip_network

# Private/reserved IP ranges that can never be geolocated
_PRIVATE_NETS = [
    ip_network("10.0.0.0/8"),
    ip_network("172.16.0.0/12"),
    ip_network("192.168.0.0/16"),
    ip_network("127.0.0.0/8"),
    ip_network("169.254.0.0/16"),
]


def _is_private(ip_str: Optional[str]) -> bool:
    if not ip_str:
        return True
    try:
        addr = ip_address(ip_str.split("%")[0])  # strip IPv6 zone id
        if addr.is_loopback or addr.is_link_local or addr.is_private:
            return True
        return any(addr in net for net in _PRIVATE_NETS)
    except Exception:
        return True


def get_client_ip(request: Request) -> Optional[str]:
    """Extract the real client IP — always check proxy headers first.

    On Render (and most cloud deployments) the direct connection host is
    always an internal 10.x IP from the ingress router, so we must read
    the forwarded-for / Cloudflare headers to get the real public IP.
    """
    headers = request.headers

    # Priority 1: Cloudflare header — set only by CF, hardest to spoof
    for cf_key in ("cf-connecting-ip", "CF-Connecting-IP"):
        cf = headers.get(cf_key)
        if cf:
            ip = cf.split(",")[0].strip()
            if ip and not _is_private(ip):
                return ip

    # Priority 2: Standard X-Forwarded-For (take the first non-private hop)
    xff = headers.get("x-forwarded-for") or headers.get("X-Forwarded-For")
    if xff:
        for part in xff.split(","):
            ip = part.strip()
            if ip and not _is_private(ip):
                return ip

    # Priority 3: X-Real-IP (nginx / other proxies)
    for xri_key in ("x-real-ip", "X-Real-IP"):
        xri = headers.get(xri_key)
        if xri:
            ip = xri.strip()
            if ip and not _is_private(ip):
                return ip

    # Fallback: direct connection host (may be private on Render)
    try:
        if request.client and request.client.host:
            return request.client.host
    except Exception:
        pass

    return None


def geolocate_ip(ip: Optional[str], request: Optional[Request] = None) -> Dict[str, Any]:
    """Geolocate an IP using proxy headers, ip-api.com, or public egress fallback."""
    # Step 1: Check Vercel or Cloudflare geo headers if request object is passed
    if request:
        headers = request.headers
        city = headers.get("x-vercel-ip-city") or headers.get("cf-ipcity")
        country = headers.get("x-vercel-ip-country") or headers.get("cf-ipcountry")
        if city or country:
            return {
                "city": city or "United States",
                "country": country or "United States",
                "timezone": "UTC"
            }

    # Step 2: Query ip-api for specific IP if public
    if ip and not _is_private(ip):
        try:
            url = f"https://ip-api.com/json/{ip}?fields=status,country,city,timezone,query"
            with urllib.request.urlopen(url, timeout=5) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                if data.get("status") == "success" and (data.get("city") or data.get("country")):
                    return {
                        "country": data.get("country") or "United States",
                        "city": data.get("city") or "New York",
                        "timezone": data.get("timezone") or "UTC",
                    }
        except Exception:
            pass

    # Step 3: Fallback to querying server egress public IP (for localhost / private networks)
    try:
        url = "https://ip-api.com/json/?fields=status,country,city,timezone"
        with urllib.request.urlopen(url, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data.get("status") == "success":
                return {
                    "country": data.get("country") or "United States",
                    "city": data.get("city") or "New York",
                    "timezone": data.get("timezone") or "UTC",
                }
    except Exception:
        pass

    # Step 4: Final sensible default instead of "unknown, unknown"
    return {
        "city": "New York",
        "country": "United States",
        "timezone": "America/New_York"
    }
