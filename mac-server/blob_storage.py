"""Tiny Vercel Blob client for the Python worker.

Uploads files via the Vercel Blob HTTP API (same protocol as the
`@vercel/blob` Node SDK) using only `requests`. We use the `put` endpoint
with `addRandomSuffix=false` and `allowOverwrite=true` so re-uploading the
same logical pathname produces a stable URL.
"""

from __future__ import annotations

import os
from pathlib import Path

import requests

BLOB_API_BASE = "https://blob.vercel-storage.com"


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
    url = f"{BLOB_API_BASE}/{blob_pathname.lstrip('/')}"
    headers = {
        "authorization": f"Bearer {token}",
        "x-content-type": content_type,
        # Skip the random suffix so the same pathname always resolves to the
        # same canonical URL across uploads.
        "x-add-random-suffix": "0",
        "x-allow-overwrite": "1",
        "x-api-version": "11",
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
        "content-type": "application/json",
        "x-api-version": "11",
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
