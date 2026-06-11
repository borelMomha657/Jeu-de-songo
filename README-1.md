# Songho – Jeu de semaille camerounais 🌾

Implémentation complète du jeu **Songho / Songo** (variante Ewondo/Bulu).  
**Projet** : NYUMEA PEHA DARYL G. | Matricule 24H2571 | Université de Yaoundé 1 | Licence 2

---

## Déploiement sur Streamlit Cloud (pas à pas)

### 1. Créer le dépôt GitHub

```bash
git init
git add .
git commit -m "Initial commit – Songho Streamlit"
git remote add origin https://github.com/VOTRE_NOM/jeu-de-songo.git
git push -u origin main
```

### 2. Déployer sur Streamlit Cloud

1. Aller sur [share.streamlit.io](https://share.streamlit.io)
2. Cliquer **New app**
3. Remplir :

| Champ | Valeur |
|---|---|
| **Repository** | `VOTRE_NOM/jeu-de-songo` |
| **Branch** | `main` |
| **Main file path** | `app.py` |

4. Cliquer **Deploy** — c'est tout !

---

## Lancer en local

```bash
pip install streamlit
streamlit run app.py
```

---

## Structure du projet

```
jeu-de-songo/
├── app.py                # Moteur de jeu + interface Streamlit
├── requirements.txt      # streamlit uniquement
├── .streamlit/
│   └── config.toml       # Thème sombre personnalisé
├── .gitignore
└── README.md
```

---

## Règles implémentées

- 14 cases (7 par joueur), 70 graines (5 par case au départ)
- Victoire à 40 graines capturées
- Semaille normale et grenier (> 13 graines)
- Capture normale, prise à la chaîne
- Interdiction d'affamer l'adversaire
- Solidarité (nourrir l'adversaire si son camp est vide)
- Case d'attaque protégée (1 ou 2 graines)
- Don forcé, fin par tablier < 10 graines
