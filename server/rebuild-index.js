import path from "node:path";
import { Store } from "./store.js";
import { RecordIndex } from "./record-index.js";
const store = new Store(process.env.VAULT_PATH || path.resolve("vault")),
  index = new RecordIndex(store);
try {
  await store.init();
  console.log(JSON.stringify(await index.rebuild(), null, 2));
} finally {
  index.close();
  store.close();
}
