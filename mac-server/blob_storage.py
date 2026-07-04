"""Tiny Vercel Blob client for the Python worker.

Mirrors the wire format of the @vercel/blob v0.27 Node SDK:
- PUT https://blob.vercel-storage.com/?pathname=<urlencoded>
- x-api-version: 9
- bearer token in Authorization
- per-call options as x-* headers (content-type, add-random-suffix, …)
"""

from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import urlencode

import requests

BLOB_API_BASE = "https://blob.vercel-storage.com"
BLOB_API_VERSION = "9"


def get_token() -> str:
    token = os.environ.get("BLOB_READ_WRITE_TOKEN")
    if not token:
        raise RuntimeError("BLOB_READ_WRITE_TOKEN is not set")
    return token


def upload_file(local_path: Path, blob_pathname: str, content_type: str) -> str:
    """Upload a local file to Vercel Blob under the given pathname.

    Returns the public URL.
    """
    token = get_token()
    pathname = blob_pathname.lstrip("/")
    url = f"{BLOB_API_BASE}/?{urlencode({'pathname': pathname})}"
    headers = {
        "authorization": f"Bearer {token}",
        "x-api-version": BLOB_API_VERSION,
        "x-content-type": content_type,
        # Stable URLs: same pathname → same canonical URL across uploads.
        "x-add-random-suffix": "0",
    }
    with open(local_path, "rb") as f:
        resp = requests.put(url, data=f, headers=headers, timeout=300)
    if resp.status_code >= 400:
        raise RuntimeError(
            f"Blob upload failed ({resp.status_code}): {resp.text[:300]}"
        )
    body = resp.json()
    return body["url"]


def delete_url(blob_url: str) -> None:
    """Delete one blob by its public URL."""
    token = get_token()
    headers = {
        "authorization": f"Bearer {token}",
        "x-api-version": BLOB_API_VERSION,
        "content-type": "application/json",
    }
    resp = requests.post(
        f"{BLOB_API_BASE}/delete",
        json={"urls": [blob_url]},
        headers=headers,
        timeout=30,
    )
    if resp.status_code >= 400:
        raise RuntimeError(
            f"Blob delete failed ({resp.status_code}): {resp.text[:300]}"
        )


def download_url(blob_url: str, dest_path: Path) -> Path:
    """Download a blob (public URL) to a local file."""
    resp = requests.get(blob_url, timeout=300, stream=True)
    resp.raise_for_status()
    with open(dest_path, "wb") as f:
        for chunk in resp.iter_content(chunk_size=1 << 16):
            if chunk:
                f.write(chunk)
    return dest_path
