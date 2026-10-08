import { createFileRoute } from "@tanstack/react-router";
import { AssemblyApp } from "@/components/assembly/AssemblyApp";

export const Route = createFileRoute("/")({ component: AssemblyApp });
