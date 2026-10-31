import type { ComponentProps } from "react";
import { ExtensionDialog } from "../features/extensions/extension-session-ui";
import { TreeModal } from "../features/conversation/tree-modal";
import { ForkModal } from "../features/conversation/fork-modal";

export function ThreadDialogs({
  extension,
  tree,
  fork,
}: {
  readonly extension?: ComponentProps<typeof ExtensionDialog>;
  readonly tree: ComponentProps<typeof TreeModal> & { readonly open: boolean };
  readonly fork: ComponentProps<typeof ForkModal> & { readonly open: boolean };
}) {
  return (
    <>
      {extension ? <ExtensionDialog {...extension} /> : null}
      {tree.open ? <TreeModal {...tree} /> : null}
      {fork.open ? <ForkModal {...fork} /> : null}
    </>
  );
}
