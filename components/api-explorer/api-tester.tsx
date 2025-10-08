"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CustomSelect } from "./custom-select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  PlayIcon,
  CopyIcon,
  CodeIcon,
  LoaderIcon,
  CheckIcon,
  XIcon,
} from "lucide-react";
import { type ApiEndpoint } from "@/lib/swagger/endpoint-discovery";
import { getApiBaseUrl } from "@/lib/config/client-env";
import { toast } from "@/lib/utils/toast-adapter";

interface ApiTesterProps {
  endpoint: ApiEndpoint;
  authToken: string;
  refreshCredits?: () => void;
}

interface TestResponse {
  success: boolean;
  status: number;
  statusText: string;
  data?: unknown;
  error?: string;
  headers: Record<string, string>;
  responseTime: number;
  timestamp: string;
}

export function ApiTester({
  endpoint,
  authToken,
  refreshCredits,
}: ApiTesterProps) {
  const [parameters, setParameters] = useState<Record<string, unknown>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<TestResponse | null>(null);
  const [activeTab, setActiveTab] = useState("parameters");

  const initializeParameters = () => {
    const defaultParams: Record<string, unknown> = {};

    if (endpoint.parameters?.body) {
      endpoint.parameters.body.forEach((param) => {
        defaultParams[param.name] = param.defaultValue || param.example || "";
      });
    }

    if (endpoint.parameters?.query) {
      endpoint.parameters.query.forEach((param) => {
        defaultParams[param.name] = param.defaultValue || param.example || "";
      });
    }

    if (endpoint.parameters?.path) {
      endpoint.parameters.path.forEach((param) => {
        defaultParams[param.name] = param.defaultValue || param.example || "";
      });
    }

    setParameters(defaultParams);
  };

  useEffect(() => {
    initializeParameters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  const handleParameterChange = (name: string, value: unknown) => {
    setParameters((prev) => ({ ...prev, [name]: value }));
  };

  const executeTest = async () => {
    if (endpoint.requiresAuth && !authToken.trim()) {
      toast({ message: "API key is required for this endpoint", mode: "error" });
      return;
    }

    if (endpoint.requiresAuth && authToken.trim()) {
      const isValidFormat =
        authToken.startsWith("eliza_") || authToken.startsWith("sk-");
      if (!isValidFormat) {
        toast({
          message: "Invalid API key format. Must start with eliza_ or sk-",
          mode: "error",
        });
        return;
      }
    }

    setIsLoading(true);
    setResponse(null);
    const startTime = Date.now();

    try {
      const baseUrl = getApiBaseUrl();
      let url = `${baseUrl}${endpoint.path}`;

      if (endpoint.parameters?.path) {
        endpoint.parameters.path.forEach((param) => {
          if (parameters[param.name]) {
            url = url.replace(
              `{${param.name}}`,
              encodeURIComponent(String(parameters[param.name])),
            );
          }
        });
      }

      if (endpoint.parameters?.query) {
        const queryParams = new URLSearchParams();
        endpoint.parameters.query.forEach((param) => {
          if (
            parameters[param.name] !== undefined &&
            parameters[param.name] !== ""
          ) {
            queryParams.append(param.name, String(parameters[param.name]));
          }
        });
        if (queryParams.toString()) {
          url += `?${queryParams.toString()}`;
        }
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (endpoint.requiresAuth && authToken) {
        headers["Authorization"] = `Bearer ${authToken}`;
      }

      let body: string | undefined;
      if (endpoint.method !== "GET" && endpoint.parameters?.body) {
        const bodyData: Record<string, unknown> = {};
        endpoint.parameters.body.forEach((param) => {
          const value = parameters[param.name];

          if ((value !== undefined && value !== "") || param.required) {
            if (param.type === "object" || param.type === "array") {
              try {
                const parsedValue = typeof value === "string" ? JSON.parse(value) : value;
                bodyData[param.name] = parsedValue;
              } catch {
                if (param.required) {
                  toast({
                    message: `Invalid JSON for ${param.name}. Please check the format.`,
                    mode: "error"
                  });
                  throw new Error(`Invalid JSON for required parameter: ${param.name}`);
                }
                bodyData[param.name] = value;
              }
            } else if (param.type === "number") {
              bodyData[param.name] = Number(value);
            } else if (param.type === "boolean") {
              bodyData[param.name] = Boolean(value);
            } else {
              bodyData[param.name] = value;
            }
          }
        });
        body = JSON.stringify(bodyData);
      }

      const fetchResponse = await fetch(url, {
        method: endpoint.method,
        headers,
        body,
      });

      const responseTime = Date.now() - startTime;
      const responseHeaders: Record<string, string> = {};
      fetchResponse.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      let responseData;
      const contentType = fetchResponse.headers.get("content-type");

      if (contentType?.includes("application/json")) {
        responseData = await fetchResponse.json();
      } else {
        responseData = await fetchResponse.text();
      }

      setResponse({
        success: fetchResponse.ok,
        status: fetchResponse.status,
        statusText: fetchResponse.statusText,
        data: responseData,
        error: fetchResponse.ok
          ? undefined
          : ((responseData as { error?: { message?: string }; message?: string })?.error?.message ||
              (responseData as { message?: string })?.message ||
              "Request failed"),
        headers: responseHeaders,
        responseTime,
        timestamp: new Date().toISOString(),
      });

      if (fetchResponse.ok) {
        toast({ message: "Request successful!", mode: "success" });
        setActiveTab("response");

        if (refreshCredits) {
          const creditConsumingEndpoints = [
            "/api/v1/generate-image",
            "/api/v1/generate-video",
            "/api/v1/chat",
          ];

          if (creditConsumingEndpoints.includes(endpoint.path)) {
            setTimeout(() => {
              refreshCredits();
            }, 1000);
          }
        }
      } else {
        toast({ message: "Request failed", mode: "error" });
        setActiveTab("response");
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      setResponse({
        success: false,
        status: 0,
        statusText: "Network Error",
        error: error instanceof Error ? error.message : "Unknown error",
        headers: {},
        responseTime,
        timestamp: new Date().toISOString(),
      });
      toast({ message: "Network error occurred", mode: "error" });
      setActiveTab("response");
    } finally {
      setIsLoading(false);
    }
  };

  const generateCurlCommand = () => {
    const baseUrl = getApiBaseUrl();
    let url = `${baseUrl}${endpoint.path}`;

    if (endpoint.parameters?.path) {
      endpoint.parameters.path.forEach((param) => {
        if (parameters[param.name]) {
          url = url.replace(
            `{${param.name}}`,
            encodeURIComponent(String(parameters[param.name])),
          );
        }
      });
    }

    if (endpoint.parameters?.query) {
      const queryParams = new URLSearchParams();
      endpoint.parameters.query.forEach((param) => {
        if (
          parameters[param.name] !== undefined &&
          parameters[param.name] !== ""
        ) {
          queryParams.append(param.name, String(parameters[param.name]));
        }
      });
      if (queryParams.toString()) {
        url += `?${queryParams.toString()}`;
      }
    }

    let command = `curl -X ${endpoint.method} "${url}"`;

    if (endpoint.requiresAuth && authToken) {
      command += ` \\\n  -H "Authorization: Bearer ${authToken}"`;
    }

    if (endpoint.method !== "GET") {
      command += ` \\\n  -H "Content-Type: application/json"`;
    }

    if (endpoint.method !== "GET" && endpoint.parameters?.body) {
      const bodyData: Record<string, unknown> = {};
      endpoint.parameters.body.forEach((param) => {
        const value = parameters[param.name];
        if (value !== undefined && value !== "") {
          bodyData[param.name] = value;
        }
      });

      if (Object.keys(bodyData).length > 0) {
        command += ` \\\n  -d '${JSON.stringify(bodyData, null, 2)}'`;
      }
    }

    return command;
  };

  const copyCurlCommand = async () => {
    const command = generateCurlCommand();
    await navigator.clipboard.writeText(command);
    toast({ message: "cURL command copied to clipboard", mode: "success" });
  };

  const renderParameterInput = (param: {
    name: string;
    type: string;
    required: boolean;
    description: string;
    example?: unknown;
    enum?: string[];
    format?: string;
    defaultValue?: unknown;
  }, value: unknown) => {
    const inputId = `param-${param.name}`;

    return (
      <div key={param.name} className="space-y-2">
        <Label htmlFor={inputId} className="flex items-center gap-2">
          {param.name}
          {param.required && <span className="text-red-500">*</span>}
          <Badge variant="outline" className="text-xs">
            {param.type}
          </Badge>
        </Label>

        <p className="text-sm text-gray-600 dark:text-gray-400">
          {param.description}
        </p>

        {param.enum ? (
          <CustomSelect
            value={String(value || "")}
            onValueChange={(v) => handleParameterChange(param.name, v)}
            options={param.enum.map((option: string) => ({
              value: option,
              label: option,
            }))}
            placeholder={`Select ${param.name}`}
          />
        ) : param.type === "boolean" ? (
          <div className="flex items-center space-x-2">
            <Checkbox
              id={inputId}
              checked={Boolean(value || false)}
              onCheckedChange={(checked) =>
                handleParameterChange(param.name, checked)
              }
            />
            <Label htmlFor={inputId} className="text-sm">
              Enable {param.name}
            </Label>
          </div>
        ) : param.type === "number" ? (
          <Input
            id={inputId}
            type="number"
            value={String(value || "")}
            onChange={(e) =>
              handleParameterChange(param.name, Number(e.target.value))
            }
            placeholder={param.example?.toString()}
          />
        ) : param.type === "object" || param.type === "array" ? (
          <Textarea
            id={inputId}
            value={
              typeof value === "string"
                ? value
                : JSON.stringify(
                    value || param.defaultValue || param.example,
                    null,
                    2,
                  )
            }
            onChange={(e) => handleParameterChange(param.name, e.target.value)}
            placeholder={JSON.stringify(
              param.defaultValue || param.example,
              null,
              2,
            )}
            rows={4}
            className="font-mono"
          />
        ) : (
          <Input
            id={inputId}
            type={param.format === "password" ? "password" : "text"}
            value={String(value || "")}
            onChange={(e) => handleParameterChange(param.name, e.target.value)}
            placeholder={param.example?.toString()}
          />
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={executeTest}
          disabled={isLoading}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? (
            <LoaderIcon className="h-4 w-4 animate-spin" />
          ) : (
            <PlayIcon className="h-4 w-4" />
          )}
          {isLoading ? "Testing..." : "Send Request"}
        </button>

        <button
          onClick={copyCurlCommand}
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          <CodeIcon className="h-4 w-4" />
          Copy cURL
        </button>

        <button
          onClick={initializeParameters}
          className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          Reset
        </button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="parameters">Parameters</TabsTrigger>
          <TabsTrigger value="response">
            Response
            {response && (
              <Badge
                variant={response.success ? "default" : "destructive"}
                className="ml-2"
              >
                {response.status}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="curl">cURL</TabsTrigger>
        </TabsList>

        <TabsContent value="parameters" className="space-y-6">
          {endpoint.parameters?.path && endpoint.parameters.path.length > 0 && (
            <Card className="border-gray-200 dark:border-transparent">
              <CardHeader>
                <CardTitle className="text-lg">Path Parameters</CardTitle>
                <CardDescription>
                  Parameters that are part of the URL path
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {endpoint.parameters.path.map((param) =>
                    renderParameterInput(param, parameters[param.name]),
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {endpoint.parameters?.query &&
            endpoint.parameters.query.length > 0 && (
              <Card className="border-gray-200 dark:border-transparent">
                <CardHeader>
                  <CardTitle className="text-lg">Query Parameters</CardTitle>
                  <CardDescription>
                    Parameters added to the URL query string
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {endpoint.parameters.query.map((param) =>
                      renderParameterInput(param, parameters[param.name]),
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

          {endpoint.parameters?.body && endpoint.parameters.body.length > 0 && (
            <Card className="border-gray-200 dark:border-transparent">
              <CardHeader>
                <CardTitle className="text-lg">Request Body</CardTitle>
                <CardDescription>
                  JSON payload sent with the request
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {endpoint.parameters.body.map((param) =>
                    renderParameterInput(param, parameters[param.name]),
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {!endpoint.parameters?.path?.length &&
            !endpoint.parameters?.query?.length &&
            !endpoint.parameters?.body?.length && (
              <Card className="border-gray-200 dark:border-transparent">
                <CardContent className="text-center py-8">
                  <p className="text-gray-500 dark:text-gray-400">
                    This endpoint doesn&apos;t require any parameters.
                  </p>
                </CardContent>
              </Card>
            )}
        </TabsContent>

        <TabsContent value="response">
          {response ? (
            <div className="space-y-4">
              <Card className="border-gray-200 dark:border-transparent">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      {response.success ? (
                        <CheckIcon className="h-5 w-5 text-green-500" />
                      ) : (
                        <XIcon className="h-5 w-5 text-red-500" />
                      )}
                      Response
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={response.success ? "default" : "destructive"}
                      >
                        {response.status} {response.statusText}
                      </Badge>
                      <Badge variant="outline">{response.responseTime}ms</Badge>
                    </div>
                  </div>
                </CardHeader>

                {response.error && (
                  <CardContent>
                    <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
                      <p className="text-red-800 dark:text-red-400 font-medium">
                        Error: {response.error}
                      </p>
                    </div>
                  </CardContent>
                )}
              </Card>

              {response.data !== undefined && (
                <Card className="border-gray-200 dark:border-transparent">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>Response Body</CardTitle>
                      <button
                        className="flex items-center gap-2 px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        onClick={() => {
                          navigator.clipboard.writeText(
                            JSON.stringify(response.data, null, 2),
                          );
                          toast({
                            message: "Response copied to clipboard",
                            mode: "success",
                          });
                        }}
                      >
                        <CopyIcon className="h-4 w-4" />
                        Copy
                      </button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[400px] w-full">
                      <pre className="text-sm bg-gray-100 dark:bg-gray-900 p-4 rounded overflow-x-auto">
                        <code>{JSON.stringify(response.data, null, 2)}</code>
                      </pre>
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}

              <Card className="border-gray-200 dark:border-transparent">
                <CardHeader>
                  <CardTitle>Response Headers</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(response.headers).map(([key, value]) => (
                      <div
                        key={key}
                        className="flex items-center gap-2 text-sm"
                      >
                        <code className="font-mono text-blue-600 dark:text-blue-400">
                          {key}:
                        </code>
                        <code className="font-mono text-gray-800 dark:text-gray-200">
                          {value}
                        </code>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card className="border-gray-200 dark:border-transparent">
              <CardContent className="text-center py-12">
                <p className="text-gray-500 dark:text-gray-400">
                  No response yet. Send a request to see the results.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="curl">
          <Card className="border-gray-200 dark:border-transparent">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>cURL Command</CardTitle>
                <button
                  className="flex items-center gap-2 px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  onClick={copyCurlCommand}
                >
                  <CopyIcon className="h-4 w-4" />
                  Copy
                </button>
              </div>
              <CardDescription>
                Copy this command to test the API from your terminal
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="text-sm bg-gray-900 text-white p-4 rounded overflow-x-auto">
                <code>{generateCurlCommand()}</code>
              </pre>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
