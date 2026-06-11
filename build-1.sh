#!/usr/bin/env bash
# build.sh
# Exécuté par Render dans la phase "Build Command"
# 1. Installe les dépendances Python
# 2. Installe les dépendances Node et build le frontend React

set -e  # arrêter immédiatement en cas d'erreur

echo "=== Installation des dépendances Python ==="
pip install -r requirements.txt

echo "=== Installation des dépendances Node (frontend) ==="
cd frontend
npm install

echo "=== Build du frontend React (Vite) ==="
npm run build

echo "=== Build terminé avec succès ==="
