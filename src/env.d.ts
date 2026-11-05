/// <reference types="astro/client" />
import type { Content, Project, Seo } from "./models/content";

declare global {
  namespace App {
    interface Locals {
      content?: Content;
      project?: Project;
      seo?: Seo;
    }
  }
}
export {};
