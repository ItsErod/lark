import path from "node:path";
import { preserveLiveUi } from "./ui-release.mjs";

const siteDir = path.resolve(process.argv[2] || "site");
await preserveLiveUi(siteDir);
console.log(`preserved live interface bundles into ${siteDir}/ui`);
