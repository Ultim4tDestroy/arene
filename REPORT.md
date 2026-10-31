# Arène : rapport automatique

Mis à jour le 2026-10-31 20:34 UTC.
Durée du test : **3,8 jour(s)** · tokens analysés : **434** (dont 343 écartés d’office) · tokens suivis en fantôme : **12** · interruptions de suivi : **18**.

## Conclusion du moment

**Encore fragile.** Au moins une stratégie dépasse 30 trades, aucune n’en a 100. Les intervalles sont larges : ne décide rien.

## Comparaison des 4 stratégies

| Stratégie | Capital | Trades valides | Réussite | Moyenne par trade [intervalle 95 %] | Rugs | Rythme | Verdict |
|---|---|---|---|---|---|---|---|
| Guide strict | 800 $ (−20,0 %) | 1 (+4 ouverts), 8 exclus | 0 % | −40,9 % | 0 | 0,3/jour → 100 trades dans ≈ 376 j | Pas assez de données (1 trade sur 30 minimum) |
| Notre filtre | 848 $ (−15,2 %) | 3, 4 exclus | 0 % | −13,1 % | 0 | 0,8/jour → 100 trades dans ≈ 123 j | Pas assez de données (3 trades sur 30 minimum) |
| Filtre léger | 598 $ (−40,2 %) | 37 (+2 ouverts), 20 exclus | 27 % | −4,5 % [−11 % ; +4 %] | 0 | 9,7/jour → 100 trades dans ≈ 7 j | Indistinguable de zéro : ni gagnante ni perdante de façon démontrée · pas de différence nette avec le témoin |
| Témoin | 468 $ (−53,2 %) | 50 (+2 ouverts), 29 exclus | 22 % | −7,1 % [−12 % ; −0 %] | 0 | 13,2/jour → 100 trades dans ≈ 4 j | Moyenne par trade négative |

## Les filtres protègent-ils ?

Chaque token négociable est suivi en fantôme avec la même sortie standard, acheté ou non. On compare ce que les tokens acceptés et refusés ont fait ensuite.

| Stratégie | Acceptés | Refusés | Verdict |
|---|---|---|---|
| Guide strict | 1 tokens · −40,9 % en moyenne · 0 % de rugs | 11 tokens · −21,4 % en moyenne · 0 % de rugs | Pas assez de tokens suivis (1 acceptés, 11 refusés ; 30 de chaque minimum) |
| Notre filtre | — | 12 tokens · −23,0 % en moyenne · 0 % de rugs | Pas assez de tokens suivis (0 acceptés, 12 refusés ; 30 de chaque minimum) |
| Filtre léger | 8 tokens · −17,8 % en moyenne · 0 % de rugs | 4 tokens · −33,5 % en moyenne · 0 % de rugs | Pas assez de tokens suivis (8 acceptés, 4 refusés ; 30 de chaque minimum) |

## Pourquoi les tokens sont refusés

- **Guide strict** : 13 achat(s) sur 91 tokens. Liquidité insuffisante : 57 · Initiés détectés : 12 · Risque critique signalé par RugCheck : 3 · Analyse RugCheck indisponible (refusé par prudence) : 3 · Top 10 des détenteurs trop concentré : 2
- **Notre filtre** : 7 achat(s) sur 91 tokens. Liquidité insuffisante : 49 · Déjà monté de trop : 19 · Score trop bas : 6 · Volume 1 h insuffisant : 5 · Chute en cours : 3
- **Filtre léger** : 59 achat(s) sur 91 tokens. Liquidité insuffisante : 20 · Analyse RugCheck indisponible (refusé par prudence) : 9 · Positions max atteintes : 3
- **Témoin** : 81 achat(s) sur 91 tokens. Positions max atteintes : 10

## À garder en tête

- Tu compares 4 stratégies : si l’une ressort, c’est peut-être la chance du tirage. Refais une seconde période avant de la croire.
- Les ordres sont supposés passés au prix affiché, avec slippage et frais estimés. En vrai, c’est pire : le papier est un plafond, pas une prévision.
- Seuls les tokens avec un profil DexScreener payant sont vus. Les contrôles RugCheck sont des approximations ; un champ absent compte comme inconnu et fait refuser le token.
- Le bot tourne par rafales de 4 minutes ; GitHub peut retarder certaines rafales. Si le suivi est interrompu plus de 25 minutes, les trades concernés sont exclus des statistiques.
- Simulation uniquement. Aucun ordre réel, aucune clé de portefeuille. Ce n’est pas un conseil d’investissement.
