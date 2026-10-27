"use client";
import { InstallGuide } from "./InstallGuide";

export function InstallHelp() {
  return <InstallGuide help onContinue={() => { if (history.length > 1) history.back(); else window.location.href = "/"; }} />;
}
