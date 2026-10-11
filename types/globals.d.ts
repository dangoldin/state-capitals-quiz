// Globals that the page scripts get from the vendor and map files.
// These libraries have no types in the project, so they are `any`.
declare const d3: any;
declare const topojson: any;
declare const WORLD_MAP: any;
declare const US_MAP: any;
interface Window {
  WORLD_MAP: any;
  US_MAP: any;
}
