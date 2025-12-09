"use client";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { LLMModel, LLMModelConfig } from "@/lib/fragments/models";
import { getTemplateId, type Templates } from "@/lib/fragments/templates";
import { Sparkles } from "lucide-react";

export function ChatPicker({
  templates,
  selectedTemplate,
  onSelectedTemplateChange,
  models,
  languageModel,
  onLanguageModelChange,
}: {
  templates: Templates;
  selectedTemplate: string;
  onSelectedTemplateChange: (template: string) => void;
  models: LLMModel[];
  languageModel: LLMModelConfig;
  onLanguageModelChange: (config: LLMModelConfig) => void;
}) {
  // Group models by provider
  const groupedModels = models.reduce(
    (acc, model) => {
      if (!acc[model.provider]) {
        acc[model.provider] = [];
      }
      acc[model.provider].push(model);
      return acc;
    },
    {} as Record<string, LLMModel[]>
  );

  return (
    <div className="flex items-center space-x-1 sm:space-x-2 flex-wrap gap-1">
      <div className="flex flex-col">
        <Select
          name="template"
          defaultValue={selectedTemplate}
          onValueChange={onSelectedTemplateChange}
        >
          <SelectTrigger className="whitespace-nowrap border-none shadow-none focus:ring-0 px-0 py-0 h-5 sm:h-6 text-[10px] sm:text-xs">
            <SelectValue placeholder="Template" />
          </SelectTrigger>
          <SelectContent side="top" className="max-h-[200px] sm:max-h-none">
            <SelectGroup>
              <SelectLabel>Template</SelectLabel>
              <SelectItem value="auto">
                <div className="flex items-center space-x-1.5 sm:space-x-2">
                  <Sparkles
                    className="flex text-[#a1a1aa] shrink-0"
                    width={12}
                    height={12}
                  />
                  <span className="text-xs sm:text-sm">Auto</span>
                </div>
              </SelectItem>
              {Object.entries(templates).map(([templateId, template]) => (
                <SelectItem key={templateId} value={templateId}>
                  <span className="text-xs sm:text-sm">{template.name}</span>
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col">
        <Select
          name="languageModel"
          defaultValue={languageModel.model}
          onValueChange={(e) => onLanguageModelChange({ model: e })}
        >
          <SelectTrigger className="whitespace-nowrap border-none shadow-none focus:ring-0 px-0 py-0 h-5 sm:h-6 text-[10px] sm:text-xs">
            <SelectValue placeholder="Model" />
          </SelectTrigger>
          <SelectContent className="max-h-[200px] sm:max-h-none">
            {Object.entries(groupedModels).map(([provider, providerModels]) => (
              <SelectGroup key={provider}>
                <SelectLabel className="text-xs sm:text-sm">{provider}</SelectLabel>
                {providerModels.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    <span className="text-xs sm:text-sm">{model.name}</span>
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

