# Arène : rapport automatique

Mis à jour le 2026-11-07 07:18 UTC.
Durée du test : **10,2 jour(s)** · tokens analysés : **1048** (dont 813 écartés d’office) · tokens suivis en fantôme : **23** · interruptions de suivi : **44**.

## Conclusion du moment

**Assez de trades pour commencer à regarder.** Cherche les stratégies dont l’intervalle reste au-dessus de zéro ET qui battent le témoin, puis exige que ça se reproduise sur une seconde période.

## Comparaison des 4 stratégies

| Stratégie | Capital | Trades valides | Réussite | Moyenne par trade [intervalle 95 %] | Rugs | Rythme | Verdict |
|---|---|---|---|---|---|---|---|
| Guide strict | 690 $ (−31,0 %) | 1 (+1 ouvert), 36 exclus | 0 % | −40,9 % | 0 | 0,1/jour → 100 trades dans ≈ 1015 j | Pas assez de données (1 trade sur 30 minimum) |
| Notre filtre | 901 $ (−9,9 %) | 16, 7 exclus | 6 % | −10,5 % [−13 % ; −7 %] | 0 | 1,6/jour → 100 trades dans ≈ 54 j | Pas assez de données (16 trades sur 30 minimum) |
| Filtre léger | 325 $ (−67,5 %) | 98 (+1 ouvert), 62 exclus | 17 % | −8,9 % [−12 % ; −5 %] | 0 | 9,6/jour → 100 trades dans ≈ 1 j | Moyenne par trade négative · pas de différence nette avec le témoin |
| Témoin | 216 $ (−78,4 %) | 119 (+3 ouverts), 78 exclus | 17 % | −9,5 % [−12 % ; −6 %] | 0 | objectif atteint | Moyenne par trade négative |

## Les filtres protègent-ils ?

Chaque token négociable est suivi en fantôme avec la même sortie standard, acheté ou non. On compare ce que les tokens acceptés et refusés ont fait ensuite.

| Stratégie | Acceptés | Refusés | Verdict |
|---|---|---|---|
| Guide strict | 1 tokens · −40,9 % en moyenne · 0 % de rugs | 22 tokens · −28,2 % en moyenne · 0 % de rugs | Pas assez de tokens suivis (1 acceptés, 22 refusés ; 30 de chaque minimum) |
| Notre filtre | 1 tokens · −37,3 % en moyenne · 0 % de rugs | 22 tokens · −28,3 % en moyenne · 0 % de rugs | Pas assez de tokens suivis (1 acceptés, 22 refusés ; 30 de chaque minimum) |
| Filtre léger | 18 tokens · −27,7 % en moyenne · 0 % de rugs | 5 tokens · −32,4 % en moyenne · 0 % de rugs | Pas assez de tokens suivis (18 acceptés, 5 refusés ; 30 de chaque minimum) |

## Pourquoi les tokens sont refusés

- **Guide strict** : 38 achat(s) sur 235 tokens. Liquidité insuffisante : 148 · Initiés détectés : 31 · Risque critique signalé par RugCheck : 7 · Top 10 des détenteurs trop concentré : 5 · Analyse RugCheck indisponible (refusé par prudence) : 3
- **Notre filtre** : 23 achat(s) sur 235 tokens. Liquidité insuffisante : 108 · Déjà monté de trop : 58 · Volume 1 h insuffisant : 18 · Score trop bas : 13 · Trop récent ou trop ancien : 6
- **Filtre léger** : 161 achat(s) sur 235 tokens. Liquidité insuffisante : 48 · Positions max atteintes : 17 · Analyse RugCheck indisponible (refusé par prudence) : 9
- **Témoin** : 200 achat(s) sur 235 tokens. Positions max atteintes : 35

## À garder en tête

- Tu compares 4 stratégies : si l’une ressort, c’est peut-être la chance du tirage. Refais une seconde période avant de la croire.
- Les ordres sont supposés passés au prix affiché, avec slippage et frais estimés. En vrai, c’est pire : le papier est un plafond, pas une prévision.
- Seuls les tokens avec un profil DexScreener payant sont vus. Les contrôles RugCheck sont des approximations ; un champ absent compte comme inconnu et fait refuser le token.
- Le bot tourne par rafales de 4 minutes ; GitHub peut retarder certaines rafales. Si le suivi est interrompu plus de 25 minutes, les trades concernés sont exclus des statistiques.
- Simulation uniquement. Aucun ordre réel, aucune clé de portefeuille. Ce n’est pas un conseil d’investissement.
