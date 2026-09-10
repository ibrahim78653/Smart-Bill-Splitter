# 🚀 Hostinger Deployment Guide — Smart Bill Splitter

This guide provides complete, step-by-step instructions for deploying the **Smart Bill Splitter** to Hostinger.

Depending on your Hostinger plan, choose **Option A** (Web / Cloud Hosting via hPanel) or **Option B** (VPS Hosting via Docker).

---

## 📦 What Zip Files Are Provided?

We have generated ready-to-use zip files in the `deploy/` directory:

1. **`hostinger-frontend.zip`**:
   - Built React production files (`index.html`, `assets/`, etc.)
   - Pre-configured `.htaccess` file for Hostinger LiteSpeed/Apache (handles SPA client-side routing, gzip compression, caching, and security headers)
   - **Use this for**: Hostinger Web Hosting / Cloud Hosting `public_html`.

2. **`hostinger-backend.zip`**:
   - FastAPI Python application (`app/`, `requirements.txt`, `passenger_wsgi.py`, `start.sh`)
   - **Use this for**: Hostinger Cloud Python Web App or hosting the backend on a server.

3. **`hostinger-vps-fullstack.zip`**:
   - Complete containerized package (`docker-compose.yml`, `backend/Dockerfile`, `frontend/Dockerfile`, `nginx.conf`)
   - **Use this for**: 1-click deployment on Hostinger VPS (Ubuntu/Debian).

4. **`hostinger-complete-project.zip`**:
   - All source code, deployment scripts, and guides in one master zip.

---

## 🌐 Option A: Hostinger Web Hosting (hPanel)

If you have a **Hostinger Web Hosting** (Single, Premium, Business) or **Cloud Hosting** plan:

### Step 1: Upload the Frontend to `public_html`
1. Log in to your [Hostinger hPanel](https://hpanel.hostinger.com/).
2. Navigate to **Websites** → select your domain → click **Manage**.
3. Under **Files**, open **File Manager** (or access via FTP).
4. Double-click the **`public_html`** folder.
5. Click the **Upload** icon (top right) → choose **File** → select `hostinger-frontend.zip`.
6. Right-click `hostinger-frontend.zip` and select **Extract**.
   - Extract destination: choose `public_html`.
7. Verify that `index.html`, `assets/`, and `.htaccess` are directly inside `public_html`.
   *(You can delete the uploaded `hostinger-frontend.zip` file after extraction).*

> **Important**: The included `.htaccess` file ensures that refreshing pages like `/bill/...` will NOT return a `404 Not Found` error.

---

### Step 2: Set Up the Backend & Database

FastAPI requires Python 3.11+ and MongoDB. Standard Hostinger Web Hosting provides PHP/MySQL, so for the backend you have two options:

#### Choice 2.1: Hostinger Cloud "Python Web Application" (if on Hostinger Cloud)
1. In hPanel, search for **Python** or **CloudLinux Python App**.
2. Click **Create Application**:
   - **Python version**: 3.11 or 3.12
   - **Application root**: `backend` (or a subfolder)
   - **Application URL**: `api.yourdomain.com` (or `yourdomain.com/api`)
3. Upload and extract `hostinger-backend.zip` into your application root.
4. In hPanel Python manager:
   - Click **Run Pip Install** using `requirements.txt`.
   - Passenger will automatically use `passenger_wsgi.py` (which bridges FastAPI via `a2wsgi`).
5. Add your environment variables in `.env`:
   ```ini
   GEMINI_API_KEY=your_google_gemini_api_key
   MONGODB_URI=your_mongodb_atlas_connection_string
   MONGODB_DB_NAME=bill_splitter
   CORS_ORIGINS=https://yourdomain.com
   ```

#### Choice 2.2: Free Backend Host (Render / Railway / Fly.io) + MongoDB Atlas
If your Hostinger plan is shared hosting (which does not allow continuous Python daemons):
1. Create a free cluster on [MongoDB Atlas](https://www.mongodb.com/atlas) (Free M0 Sandbox).
   - Add database user & password.
   - Set Network Access to `0.0.0.0/0` (allow from anywhere).
   - Copy connection string (e.g. `mongodb+srv://user:pass@cluster.mongodb.net/?retryWrites=true&w=majority`).
2. Deploy the backend to [Render.com](https://render.com) (Free Web Service):
   - Connect your GitHub repo (or upload backend code).
   - Root directory: `backend`
   - Build command: `pip install -r requirements.txt`
   - Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - Add Environment Variables: `GEMINI_API_KEY`, `MONGODB_URI`, `CORS_ORIGINS=https://yourdomain.com`.
3. If building the frontend to point to Render:
   - Set `VITE_API_URL=https://your-app.onrender.com` in `frontend/.env.production`
   - Run `npm run build` inside `frontend/`
   - Upload the new `dist/` contents to Hostinger `public_html`.

---

## 🖥️ Option B: Hostinger VPS Hosting (Docker 1-Click)

If you have a **Hostinger VPS** (KVM 1, 2, 4, or 8 running Ubuntu/Debian), this is the cleanest full-stack method.

### Step 1: Connect to your VPS
```bash
ssh root@your_vps_ip
```

### Step 2: Install Docker & Docker Compose (if not installed)
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
apt-get install -y docker-compose-plugin
```

### Step 3: Upload and Extract the VPS Package
You can upload `hostinger-vps-fullstack.zip` using SCP/SFTP:
```bash
scp deploy/hostinger-vps-fullstack.zip root@your_vps_ip:/var/www/
```
Then on the VPS:
```bash
mkdir -p /var/www/bill-splitter
cd /var/www/bill-splitter
unzip /var/www/hostinger-vps-fullstack.zip
```

### Step 4: Configure `.env`
Create your `.env` file:
```bash
cat << 'EOF' > .env
GEMINI_API_KEY=your_actual_gemini_api_key_here
GEMINI_MODEL=gemini-flash-latest
EOF
```

### Step 5: Start the Application
```bash
docker compose up -d --build
```

### Step 6: Verify
- Visit `http://your_vps_ip/` in your browser.
- Nginx automatically handles:
  - Frontend SPA routes (`/`)
  - API proxy (`/api/` → FastAPI container on port 8000)
  - Image upload storage (`/uploads/` → backend uploads)
  - Database (`mongodb` container on port 27017 with persistent volume `mongo-data`)

---

## 🔍 Troubleshooting & FAQ

| Issue | Cause | Fix |
| :--- | :--- | :--- |
| **404 Not Found on Page Refresh** | Apache can't resolve client-side routes | Make sure `.htaccess` is uploaded inside `public_html`. It redirects all non-file paths to `index.html`. |
| **CORS Error in Browser Console** | Backend hasn't whitelisted the domain | In your backend `.env`, set `CORS_ORIGINS=https://yourdomain.com` (or `*` for testing). |
| **OCR / Gemini Failure** | Missing or invalid Gemini API Key | Get a free Gemini API key from [Google AI Studio](https://aistudio.google.com/) and add it to `GEMINI_API_KEY`. |
| **Image Uploads fail (413 Payload Too Large)** | Web server request size limit | Hostinger PHP/Nginx defaults to 2MB. In the provided Nginx/Apache configs, we set `client_max_body_size 25M;`. |
