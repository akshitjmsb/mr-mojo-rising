# Cloudflare Tunnel Setup

Expose the local Mac FastAPI server to the internet so the Vercel-hosted frontend can reach it.

## Prerequisites

- Cloudflare account with a domain
- `cloudflared` CLI installed: `brew install cloudflare/cloudflare/cloudflared`

## Steps

1. **Login to Cloudflare:**
   ```bash
   cloudflared tunnel login
   ```

2. **Create a tunnel:**
   ```bash
   cloudflared tunnel create mojo-mac
   ```
   Note the tunnel ID printed.

3. **Configure DNS:**
   ```bash
   cloudflared tunnel route dns mojo-mac mojo-api.yourdomain.com
   ```

4. **Update config:**
   Edit `cloudflare-tunnel/config.yml`:
   - Replace `<TUNNEL_ID>` with your tunnel ID
   - Replace `<username>` with your macOS username
   - Replace `mojo-api.yourdomain.com` with your actual subdomain

5. **Run the tunnel:**
   ```bash
   cloudflared tunnel --config cloudflare-tunnel/config.yml run mojo-mac
   ```

6. **Set environment variable on Vercel:**
   ```
   MAC_API_URL=https://mojo-api.yourdomain.com
   MAC_API_SECRET=your-api-secret
   ```

## Running as a service (optional)

To keep the tunnel running in the background:
```bash
sudo cloudflared service install
```

## Testing

```bash
curl https://mojo-api.yourdomain.com/docs
```
Should show the FastAPI Swagger UI.
