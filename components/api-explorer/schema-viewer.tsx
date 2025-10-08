"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CopyIcon,
  DatabaseIcon,
  InfoIcon,
} from "lucide-react";
import { toast } from "@/lib/utils/toast-adapter";
import { cn } from "@/lib/utils";
import type { OpenAPISpec, OpenAPISchema } from "@/lib/swagger/openapi-generator";

interface SchemaViewerProps {
  spec: OpenAPISpec | null;
}

export function SchemaViewer({ spec }: SchemaViewerProps) {
  const [expandedSchemas, setExpandedSchemas] = useState<Set<string>>(
    new Set(),
  );

  if (!spec) {
    return (
      <Card className="border-gray-200 dark:border-transparent">
        <CardContent className="text-center py-12">
          <DatabaseIcon className="h-12 w-12 mx-auto mb-4 text-gray-400" />
          <p className="text-gray-500 dark:text-gray-400">Loading schemas...</p>
        </CardContent>
      </Card>
    );
  }

  const toggleSchema = (schemaName: string) => {
    const newExpanded = new Set(expandedSchemas);
    if (newExpanded.has(schemaName)) {
      newExpanded.delete(schemaName);
    } else {
      newExpanded.add(schemaName);
    }
    setExpandedSchemas(newExpanded);
  };

  const copySchema = async (schemaName: string, schema: OpenAPISchema) => {
    await navigator.clipboard.writeText(JSON.stringify(schema, null, 2));
    toast({
      message: `${schemaName} schema copied to clipboard`,
      mode: "success",
    });
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "string":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300";
      case "number":
      case "integer":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300";
      case "boolean":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300";
      case "array":
        return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300";
      case "object":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300";
    }
  };

  const renderProperty = (
    name: string,
    schema: OpenAPISchema,
    level = 0,
  ) => {
    const isRequired = false;

    return (
      <div
        key={name}
        className="border-l-2 border-gray-200 dark:border-gray-700 pl-4 mb-3"
      >
        <div className="flex items-center gap-2 mb-2">
          <code className="font-mono font-semibold text-sm">{name}</code>
          {isRequired && (
            <Badge variant="destructive" className="text-xs">
              required
            </Badge>
          )}
          {schema.type && (
            <Badge className={cn("text-xs", getTypeColor(schema.type))}>
              {schema.type}
            </Badge>
          )}
          {schema.format && (
            <Badge variant="outline" className="text-xs">
              {schema.format}
            </Badge>
          )}
        </div>

        {schema.description && (
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
            {schema.description}
          </p>
        )}

        {schema.example !== undefined && (
          <div className="mb-2">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Example:
            </div>
            <code className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
              {String(JSON.stringify(schema.example))}
            </code>
          </div>
        )}

        {schema.enum && (
          <div className="mb-2">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Enum values:
            </div>
            <div className="flex flex-wrap gap-1">
              {schema.enum.map((value, index) => (
                <Badge key={index} variant="outline" className="text-xs">
                  {String(JSON.stringify(value))}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {schema.type === "array" && schema.items && (
          <div className="ml-4">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
              Array items:
            </div>
            {renderProperty("items", schema.items, level + 1)}
          </div>
        )}

        {schema.type === "object" && schema.properties && (
          <div className="ml-4">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
              Properties:
            </div>
            {Object.entries(schema.properties).map(([propName, propSchema]) =>
              renderProperty(propName, propSchema, level + 1),
            )}
          </div>
        )}
      </div>
    );
  };

  const renderSchema = (name: string, schema: OpenAPISchema) => {
    const isExpanded = expandedSchemas.has(name);

    return (
      <Card key={name} className="mb-4 border-gray-200 dark:border-transparent">
        <Collapsible open={isExpanded} onOpenChange={() => toggleSchema(name)}>
          <CollapsibleTrigger className="w-full">
            <CardHeader className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isExpanded ? (
                    <ChevronDownIcon className="h-4 w-4" />
                  ) : (
                    <ChevronRightIcon className="h-4 w-4" />
                  )}
                  <CardTitle className="text-lg">{name}</CardTitle>
                  {schema.type && (
                    <Badge className={getTypeColor(schema.type)}>
                      {schema.type}
                    </Badge>
                  )}
                </div>
                <button
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    copySchema(name, schema);
                  }}
                >
                  <CopyIcon className="h-4 w-4" />
                </button>
              </div>
              {schema.description && (
                <p className="text-sm text-gray-600 dark:text-gray-400 text-left">
                  {schema.description}
                </p>
              )}
            </CardHeader>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <CardContent>
              {schema.type === "object" && schema.properties ? (
                <div className="space-y-4">
                  <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Properties:
                  </div>
                  {Object.entries(schema.properties).map(
                    ([propName, propSchema]) =>
                      renderProperty(propName, propSchema),
                  )}

                  {schema.required && schema.required.length > 0 && (
                    <div className="mt-4">
                      <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Required fields:
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {schema.required.map((field) => (
                          <Badge
                            key={field}
                            variant="destructive"
                            className="text-xs"
                          >
                            {field}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {schema.example !== undefined && (
                    <div>
                      <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Example:
                      </div>
                      <pre className="text-sm bg-gray-100 dark:bg-gray-900 p-3 rounded overflow-x-auto">
                        <code>{String(JSON.stringify(schema.example, null, 2))}</code>
                      </pre>
                    </div>
                  )}

                  {schema.enum && (
                    <div>
                      <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Possible values:
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {schema.enum.map((value, index) => (
                          <Badge key={index} variant="outline">
                            {String(JSON.stringify(value))}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>
    );
  };

  const schemas = spec.components?.schemas || {};
  const schemaEntries = Object.entries(schemas);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">API Schemas</h2>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Data structures and type definitions used by the API
          </p>
        </div>
        <Badge variant="outline">{schemaEntries.length} schemas</Badge>
      </div>

      {schemaEntries.length > 0 && (
        <div className="flex gap-2">
          <button
            className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            onClick={() => setExpandedSchemas(new Set(Object.keys(schemas)))}
          >
            Expand All
          </button>
          <button
            className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            onClick={() => setExpandedSchemas(new Set())}
          >
            Collapse All
          </button>
        </div>
      )}

      <ScrollArea className="h-[600px]">
        {schemaEntries.length > 0 ? (
          <div className="space-y-4">
            {schemaEntries.map(([name, schema]) => renderSchema(name, schema))}
          </div>
        ) : (
          <Card className="border-gray-200 dark:border-transparent">
            <CardContent className="text-center py-12">
              <InfoIcon className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                No schemas defined
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                This API specification doesn&apos;t include any schema definitions.
              </p>
            </CardContent>
          </Card>
        )}
      </ScrollArea>
    </div>
  );
}
