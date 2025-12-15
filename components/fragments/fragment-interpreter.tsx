"use client";

import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import type { ExecutionResultInterpreter } from "@/lib/fragments/types";
import { Terminal } from "lucide-react";
import Image from "next/image";

function LogsOutput({
  stdout,
  stderr,
}: {
  stdout: string[];
  stderr: string[];
}) {
  if (stdout.length === 0 && stderr.length === 0) return null;

  return (
    <div className="w-full h-32 max-h-32 overflow-y-auto flex flex-col items-start justify-start space-y-1 p-4">
      {stdout &&
        stdout.length > 0 &&
        stdout.map((out: string, index: number) => (
          <pre key={index} className="text-xs">
            {out}
          </pre>
        ))}
      {stderr &&
        stderr.length > 0 &&
        stderr.map((err: string, index: number) => (
          <pre key={index} className="text-xs text-red-500">
            {err}
          </pre>
        ))}
    </div>
  );
}

export function FragmentInterpreter({
  result,
}: {
  result: ExecutionResultInterpreter;
}) {
  const { cellResults, stdout, stderr, runtimeError } = result;

  if (runtimeError) {
    const { name, message, traceback } = runtimeError;
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <Terminal className="h-4 w-4" />
          <AlertTitle>
            {name}: {message}
          </AlertTitle>
          {traceback && (
            <AlertDescription className="font-mono whitespace-pre-wrap">
              {traceback}
            </AlertDescription>
          )}
        </Alert>
      </div>
    );
  }

  if (cellResults.length > 0) {
    const firstResult = cellResults[0];
    const imgInBase64 = firstResult.data as string | undefined;

    if (imgInBase64 && typeof imgInBase64 === "string") {
      return (
        <div className="flex flex-col h-full">
          <div className="w-full flex-1 p-4 flex items-start justify-center border-b">
            <Image
              src={`data:image/png;base64,${imgInBase64}`}
              alt="result"
              width={600}
              height={400}
            />
          </div>
          <LogsOutput stdout={stdout} stderr={stderr} />
        </div>
      );
    }
  }

  if (stdout.length > 0 || stderr.length > 0) {
    return <LogsOutput stdout={stdout} stderr={stderr} />;
  }

  return <span className="p-4 text-muted-foreground">No output or logs</span>;
}
