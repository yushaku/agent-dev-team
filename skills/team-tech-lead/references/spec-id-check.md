# Spec ID check

Each repo with `docs/product/` has one in `commands.verify`: every `<capability> Rn|ACn` in test names exists in `docs/product/<capability>.md` and is not on its `Retired:` line. The assigned spec author adds it, as a small script in the repo's own tooling, in the first Run that lacks it.
