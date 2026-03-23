import { h, render } from "preact";
import { useEffect, useState } from "preact/hooks";

declare const shopify: {
  data?: {
    selected?: Array<{ id: string }>;
  };
  extension?: {
    setFullscreenAppUrl?: (url: string) => void;
  };
};

export default async () => {
  render(<TerritoryBlock />, document.body);
};

function TerritoryBlock() {
  const { data, extension } = shopify;
  const companyGid = data?.selected?.[0]?.id;

  const [territory, setTerritory] = useState<string | null>(null);
  const [rep, setRep] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyGid) {
      setLoading(false);
      return;
    }

    // TODO: Fetch from API
    // For now, show placeholder
    setLoading(false);
    setTerritory(null);
    setRep(null);
  }, [companyGid]);

  const handleManage = () => {
    extension?.setFullscreenAppUrl?.(`/app/companies/${encodeURIComponent(companyGid || "")}`);
  };

  if (loading) {
    return (
      <s-admin-block heading="Field Sales">
        <s-text color="subdued">Loading...</s-text>
      </s-admin-block>
    );
  }

  return (
    <s-admin-block heading="Field Sales">
      <s-stack gap="base">
        <s-stack gap="small-100">
          <s-text type="strong">Territory</s-text>
          <s-text color={territory ? undefined : "subdued"}>
            {territory || "Not assigned"}
          </s-text>
        </s-stack>

        <s-divider />

        <s-stack gap="small-100">
          <s-text type="strong">Sales Rep</s-text>
          <s-text color={rep ? undefined : "subdued"}>
            {rep || "Not assigned"}
          </s-text>
        </s-stack>

        <s-divider />

        <s-button onClick={handleManage}>Manage</s-button>
      </s-stack>
    </s-admin-block>
  );
}
