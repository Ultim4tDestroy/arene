# Arène automatique (simulation)

Fait tourner l'Arène du Dénicheur (4 stratégies de memecoins Solana comparées sur les mêmes tokens) **sans ton PC**, gratuitement, sur GitHub.
**Simulation uniquement** : aucun ordre réel, aucune clé de portefeuille, aucun mot de passe à fournir.

## Mise en route (environ 10 minutes)

1. Crée un compte sur github.com si tu n'en as pas.
2. Crée un nouveau dépôt (bouton **New**). Nom au choix, par exemple `arene`. **Choisis « Public »** : c'est ce qui rend les minutes de calcul gratuites et illimitées. Il ne contiendra que des données simulées.
3. Dans le dépôt, clique **uploading an existing file** et glisse dedans le dossier `bot` ainsi que `README.md` (tout sauf `arena.yml`).
4. Clique **Add file → Create new file**. Dans le nom du fichier, tape exactement `.github/workflows/arena.yml` (les `/` créent les dossiers). Colle dedans tout le contenu du fichier `arena.yml` fourni, puis **Commit changes**.
5. Va dans **Settings → Actions → General**, tout en bas dans **Workflow permissions**, choisis **Read and write permissions**, puis **Save**.
6. Va dans l'onglet **Actions**. Si GitHub demande d'activer les workflows, accepte. Clique sur **arena** à gauche, puis **Run workflow**.
7. Attends 5 minutes. Le workflow doit afficher une coche verte. Ensuite il se relance tout seul toutes les 5 minutes environ.

## Lire les résultats

Ouvre la branche **data** du dépôt (menu des branches, en haut à gauche) : le fichier **REPORT.md** contient la comparaison, les verdicts et le rythme (« 100 trades dans ≈ X jours »). Il se met à jour à chaque rafale. `state.json` contient toutes les données : tu peux me l'envoyer pour une analyse plus poussée.

## À savoir

- GitHub lance les rafales avec du retard, parfois 10 minutes ou plus. Si le suivi est coupé plus de 25 minutes, les trades concernés sont exclus des statistiques (compteur « interruptions » dans le rapport).
- GitHub désactive un dépôt sans activité après 60 jours : ce test dure bien moins.
- Pour arrêter : onglet **Actions → arena → ⋯ → Disable workflow**.
- Les sources (DexScreener, RugCheck) n'ont pas pu être testées depuis mon environnement. Si le premier rapport indique « aucun token analysé » ou des erreurs, ouvre le journal de l'exécution (onglet Actions) et envoie-moi le message.
