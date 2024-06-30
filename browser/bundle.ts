import { bundle } from "https://deno.land/x/emit@0.40.0/mod.ts";

const url = new URL("./mod.ts", import.meta.url);

const { code } = await bundle(url);
console.log(code);
Deno.writeTextFile("browser/mqtt5.mjs", code);