import '@shopify/ui-extensions';

//@ts-ignore
declare module './src/TerritoryBlock.tsx' {
  const shopify: import('@shopify/ui-extensions/admin.company-details.block.render').Api;
  const globalThis: { shopify: typeof shopify };
}
