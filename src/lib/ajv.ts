import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

// ajv and ajv-formats are CommonJS; normalise default-export interop across Node ESM, vitest and Next bundling.
const AjvCtor = ((Ajv2020 as unknown as { default?: typeof Ajv2020 }).default ?? Ajv2020) as typeof Ajv2020;
const addFormatsFn = ((addFormats as unknown as { default?: typeof addFormats }).default ?? addFormats) as typeof addFormats;

export function createAjv() {
  // strictRequired off: schemas use anyOf/required groups over properties declared once.
  const ajv = new AjvCtor({ allErrors: true, strict: true, strictRequired: false });
  addFormatsFn(ajv);
  return ajv;
}
