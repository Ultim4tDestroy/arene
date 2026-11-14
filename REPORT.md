# Arène : rapport automatique

Mis à jour le 2026-11-14 07:45 UTC.
Durée du test : **17,3 jour(s)** · tokens analysés : **1626** (dont 1257 écartés d’office) · tokens suivis en fantôme : **34** · interruptions de suivi : **72**.

## Conclusion du moment

**Assez de trades pour commencer à regarder.** Cherche les stratégies dont l’intervalle reste au-dessus de zéro ET qui battent le témoin, puis exige que ça se reproduise sur une seconde période.

## Comparaison des 4 stratégies

| Stratégie | Capital | Trades valides | Réussite | Moyenne par trade [intervalle 95 %] | Rugs | Rythme | Verdict |
|---|---|---|---|---|---|---|---|
| Guide strict | 387 $ (−61,3 %) | 2 (+2 ouverts), 60 exclus | 0 % | −41,0 % | 0 | 0,1/jour → 100 trades dans ≈ 846 j | Pas assez de données (2 trades sur 30 minimum) |
| Notre filtre | 804 $ (−19,6 %) | 25, 9 exclus | 4 % | −11,7 % [−14 % ; −9 %] | 0 | 1,4/jour → 100 trades dans ≈ 52 j | Pas assez de données (25 trades sur 30 minimum) |
| Filtre léger | 102 $ (−89,8 %) | 151, 109 exclus | 13 % | −10,4 % [−13 % ; −8 %] | 1 | objectif atteint | Moyenne par trade négative · pas de différence nette avec le témoin |
| Témoin | 73 $ (−92,7 %) | 180 (+1 ouvert), 138 exclus | 14 % | −10,3 % [−12 % ; −8 %] | 1 | objectif atteint | Moyenne par trade négative |

## Les filtres protègent-ils ?

Chaque token négociable est suivi en fantôme avec la même sortie standard, acheté ou non. On compare ce que les tokens acceptés et refusés ont fait ensuite.

| Stratégie | Acceptés | Refusés | Verdict |
|---|---|---|---|
| Guide strict | 3 tokens · −37,1 % en moyenne · 0 % de rugs | 31 tokens · −34,0 % en moyenne · 10 % de rugs | Pas assez de tokens suivis (3 acceptés, 31 refusés ; 30 de chaque minimum) |
| Notre filtre | 2 tokens · −32,9 % en moyenne · 0 % de rugs | 32 tokens · −34,4 % en moyenne · 9 % de rugs | Pas assez de tokens suivis (2 acceptés, 32 refusés ; 30 de chaque minimum) |
| Filtre léger | 27 tokens · −36,3 % en moyenne · 11 % de rugs | 7 tokens · −26,5 % en moyenne · 0 % de rugs | Pas assez de tokens suivis (27 acceptés, 7 refusés ; 30 de chaque minimum) |

## Pourquoi les tokens sont refusés

- **Guide strict** : 64 achat(s) sur 369 tokens. Liquidité insuffisante : 226 · Initiés détectés : 52 · Risque critique signalé par RugCheck : 10 · Top 10 des détenteurs trop concentré : 7 · Liquidité pas assez verrouillée : 6
- **Notre filtre** : 34 achat(s) sur 369 tokens. Liquidité insuffisante : 170 · Déjà monté de trop : 81 · Volume 1 h insuffisant : 35 · Score trop bas : 25 · Trop récent ou trop ancien : 11
- **Filtre léger** : 260 achat(s) sur 369 tokens. Liquidité insuffisante : 79 · Positions max atteintes : 20 · Analyse RugCheck indisponible (refusé par prudence) : 9 · Autorité de création (mint) encore ouverte : 1
- **Témoin** : 319 achat(s) sur 369 tokens. Positions max atteintes : 50

## À garder en tête

- Tu compares 4 stratégies : si l’une ressort, c’est peut-être la chance du tirage. Refais une seconde période avant de la croire.
- Les ordres sont supposés passés au prix affiché, avec slippage et frais estimés. En vrai, c’est pire : le papier est un plafond, pas une prévision.
- Seuls les tokens avec un profil DexScreener payant sont vus. Les contrôles RugCheck sont des approximations ; un champ absent compte comme inconnu et fait refuser le token.
- Le bot tourne par rafales de 4 minutes ; GitHub peut retarder certaines rafales. Si le suivi est interrompu plus de 25 minutes, les trades concernés sont exclus des statistiques.
- Simulation uniquement. Aucun ordre réel, aucune clé de portefeuille. Ce n’est pas un conseil d’investissement.
