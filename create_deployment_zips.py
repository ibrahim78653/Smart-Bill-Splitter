import os
import shutil
import zipfile
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
DEPLOY_DIR = ROOT_DIR / "deploy"
FRONTEND_DIST = ROOT_DIR / "frontend" / "dist"
BACKEND_DIR = ROOT_DIR / "backend"
FRONTEND_DIR = ROOT_DIR / "frontend"


def make_zip_from_dir_contents(source_dir: Path, output_zip: Path, exclude_patterns=None):
    """Zip the contents of source_dir directly into output_zip (no extra root folder)."""
    exclude_patterns = exclude_patterns or []
    if output_zip.exists():
        output_zip.unlink()

    with zipfile.ZipFile(output_zip, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(source_dir):
            dirs[:] = [
                d for d in dirs
                if not any(pat in d for pat in ["__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache", ".hypothesis", "node_modules"])
            ]
            for file in files:
                full_path = Path(root) / file
                rel_path = full_path.relative_to(source_dir)
                if any(pat in str(rel_path) for pat in exclude_patterns):
                    continue
                zf.write(full_path, arcname=str(rel_path))
    print(f"Created: {output_zip} ({output_zip.stat().st_size / 1024:.1f} KB)")


def create_frontend_zip():
    """Package the production build of the frontend with .htaccess."""
    output_zip = DEPLOY_DIR / "hostinger-frontend.zip"
    make_zip_from_dir_contents(FRONTEND_DIST, output_zip)


def create_backend_zip():
    """Package the FastAPI backend for Hostinger Cloud/cPanel or VPS."""
    output_zip = DEPLOY_DIR / "hostinger-backend.zip"
    if output_zip.exists():
        output_zip.unlink()

    exclude_files = [".env", ".coverage", "htmlcov"]
    exclude_dirs = ["__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache", ".hypothesis"]

    with zipfile.ZipFile(output_zip, "w", zipfile.ZIP_DEFLATED) as zf:
        # Include empty uploads folder marker
        zf.writestr("uploads/.gitkeep", "# Smart Bill Splitter uploaded receipt images\n")

        for root, dirs, files in os.walk(BACKEND_DIR):
            dirs[:] = [d for d in dirs if d not in exclude_dirs and d != "uploads"]
            for file in files:
                if file in exclude_files or file.endswith(".pyc"):
                    continue
                full_path = Path(root) / file
                rel_path = full_path.relative_to(BACKEND_DIR)
                zf.write(full_path, arcname=str(rel_path))
    print(f"Created: {output_zip} ({output_zip.stat().st_size / 1024:.1f} KB)")


def create_vps_fullstack_zip():
    """Package the full-stack docker-compose setup for Hostinger VPS."""
    output_zip = DEPLOY_DIR / "hostinger-vps-fullstack.zip"
    if output_zip.exists():
        output_zip.unlink()

    ignore_dirs = {
        "node_modules", ".git", "dist", "__pycache__", ".pytest_cache",
        ".mypy_cache", ".ruff_cache", ".hypothesis", "uploads", "deploy", "scratch"
    }

    with zipfile.ZipFile(output_zip, "w", zipfile.ZIP_DEFLATED) as zf:
        # Include root docker-compose, root .env.example, and guide
        zf.write(ROOT_DIR / "docker-compose.yml", arcname="docker-compose.yml")
        if (ROOT_DIR / ".env.example").exists():
            zf.write(ROOT_DIR / ".env.example", arcname=".env.example")
        zf.write(ROOT_DIR / "HOSTINGER_DEPLOYMENT_GUIDE.md", arcname="HOSTINGER_DEPLOYMENT_GUIDE.md")
        zf.writestr("backend/uploads/.gitkeep", "# uploads storage\n")

        # Walk backend
        for root, dirs, files in os.walk(BACKEND_DIR):
            dirs[:] = [d for d in dirs if d not in ignore_dirs and d != "uploads"]
            for file in files:
                if file == ".env" or file.endswith(".pyc"):
                    continue
                full_path = Path(root) / file
                rel_path = full_path.relative_to(ROOT_DIR)
                zf.write(full_path, arcname=str(rel_path))

        # Walk frontend
        for root, dirs, files in os.walk(FRONTEND_DIR):
            dirs[:] = [d for d in dirs if d not in ignore_dirs and d != "dist"]
            for file in files:
                if file == ".env":
                    continue
                full_path = Path(root) / file
                rel_path = full_path.relative_to(ROOT_DIR)
                zf.write(full_path, arcname=str(rel_path))

    print(f"Created: {output_zip} ({output_zip.stat().st_size / 1024:.1f} KB)")


def create_master_all_zip():
    """Package everything into a single master archive for Hostinger deployment."""
    output_zip = DEPLOY_DIR / "hostinger-smart-bill-splitter-all.zip"
    if output_zip.exists():
        output_zip.unlink()

    with zipfile.ZipFile(output_zip, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.write(DEPLOY_DIR / "hostinger-frontend.zip", arcname="hostinger-frontend.zip")
        zf.write(DEPLOY_DIR / "hostinger-backend.zip", arcname="hostinger-backend.zip")
        zf.write(DEPLOY_DIR / "hostinger-vps-fullstack.zip", arcname="hostinger-vps-fullstack.zip")
        zf.write(ROOT_DIR / "HOSTINGER_DEPLOYMENT_GUIDE.md", arcname="HOSTINGER_DEPLOYMENT_GUIDE.md")
        if (ROOT_DIR / ".env.example").exists():
            zf.write(ROOT_DIR / ".env.example", arcname=".env.example")
    print(f"Created: {output_zip} ({output_zip.stat().st_size / 1024:.1f} KB)")


def main():
    DEPLOY_DIR.mkdir(parents=True, exist_ok=True)
    print("Building Hostinger deployment packages...")
    create_frontend_zip()
    create_backend_zip()
    create_vps_fullstack_zip()
    create_master_all_zip()
    print("\nAll deployment zip packages created successfully in ./deploy/")


if __name__ == "__main__":
    main()
