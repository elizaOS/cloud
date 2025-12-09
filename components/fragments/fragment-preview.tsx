"use client";

import { FragmentInterpreter } from "./fragment-interpreter";
import { FragmentWeb } from "./fragment-web";
import { getTemplateId } from "@/lib/fragments/templates";
import type {
  ExecutionResult,
  ExecutionResultInterpreter,
  ExecutionResultWeb,
} from "@/lib/fragments/types";

export function FragmentPreview({ result }: { result: ExecutionResult }) {
  if (getTemplateId(result.template) === "code-interpreter-v1") {
    return <FragmentInterpreter result={result as ExecutionResultInterpreter} />;
  }

  return <FragmentWeb result={result as ExecutionResultWeb} />;
}

