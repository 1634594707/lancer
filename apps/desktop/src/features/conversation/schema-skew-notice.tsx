import { t } from "../../../contracts/i18n";

export function SchemaSkewNotice({ onDismiss }: { readonly onDismiss: () => void }) {
  return (
    <div className="schema-skew-notice" role="status" data-testid="schema-skew-notice">
      <span className="schema-skew-notice__text">{t("app.schemaSkew.message")}</span>
      <button
        type="button"
        className="schema-skew-notice__dismiss"
        aria-label={t("app.schemaSkew.dismissLabel")}
        onClick={onDismiss}
      >
        {t("app.schemaSkew.dismiss")}
      </button>
    </div>
  );
}
