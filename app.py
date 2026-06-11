"""
Songho – Serveur Flask
Sert le frontend React buildé (dossier frontend/dist).
Compatible avec le déploiement Render (Web Service).
"""

import os
from flask import Flask, send_from_directory

# Le dossier dist est produit par `npm run build` dans frontend/
FRONTEND_DIST = os.path.join(os.path.dirname(__file__), "frontend", "dist")

app = Flask(__name__, static_folder=FRONTEND_DIST, static_url_path="")


@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve(path):
    """
    Toutes les routes renvoient index.html (SPA React).
    Les fichiers statiques (JS, CSS, assets) sont servis directement
    par Flask grâce à static_folder.
    """
    file_path = os.path.join(FRONTEND_DIST, path)
    if path and os.path.exists(file_path):
        return send_from_directory(FRONTEND_DIST, path)
    return send_from_directory(FRONTEND_DIST, "index.html")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
