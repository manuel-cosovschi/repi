-- Reversión de 0042 (D188). Sólo si se abandona también el código del tema global: el anterior ignora estas columnas,
-- así que revertir el código NO requiere correr esto. Pierde únicamente la apariencia elegida por cada cuenta.
ALTER TABLE "user_pref" DROP CONSTRAINT IF EXISTS "user_pref_theme_valid";
ALTER TABLE "user_pref" DROP COLUMN IF EXISTS "theme_changed_at";
ALTER TABLE "user_pref" DROP COLUMN IF EXISTS "theme";
