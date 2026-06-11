# Songho – Jeu de semaille camerounais

Implémentation du jeu **Songho / Songo** (variante Ewondo/Bulu)  
Projet : NYUMEA PEHA DARYL G. | Matricule 24H2571 | Université de Yaoundé 1 | Licence 2

---

## Structure du projet

```
songho/
├── app.py               # Serveur Flask (sert le frontend buildé)
├── requirements.txt     # Dépendances Python
├── build.sh             # Script de build pour Render
├── .gitignore
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── main.jsx
        └── SonghoGame.jsx   # Moteur + UI complets
```

---

## Déploiement sur Render (pas à pas)

### 1. Créer le dépôt GitHub

```bash
git init
git add .
git commit -m "Initial commit – Songho game"
# Créer un repo sur github.com, puis :
git remote add origin https://github.com/VOTRE_NOM/songho.git
git push -u origin main
```

### 2. Créer un Web Service sur Render

1. Aller sur [render.com](https://render.com) → **New** → **Web Service**
2. Connecter votre compte GitHub et sélectionner le repo `songho`
3. Remplir les champs :

| Champ | Valeur |
|---|---|
| **Name** | `songho` (ou ce que vous voulez) |
| **Runtime** | `Python 3` |
| **Build Command** | `chmod +x build.sh && ./build.sh` |
| **Start Command** | `gunicorn app:app` |
| **Instance Type** | Free |

4. Cliquer **Create Web Service**

Render exécutera `build.sh` (installe Python + Node, build le React), puis démarrera Flask via Gunicorn.

---

## Développement local

### Lancer le frontend seul (hot reload)
```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

### Build + lancer Flask complet
```bash
cd frontend && npm run build && cd ..
pip install -r requirements.txt
python app.py
# → http://localhost:5000
```

---

## Règles du jeu

- **14 cases** (7 par joueur), **70 graines** au départ (5 par case)
- **Victoire** : atteindre 40 graines capturées
- Prise normale : dernière graine chez l'adversaire dans une case à 2, 3 ou 4 graines
- Prise à la chaîne, grenier (>13 graines), solidarité et interdiction d'affamer
- Voir `FORMALISATION_DU_JEU_ALGORITHME_COMPLET.pdf` pour la spécification complète
