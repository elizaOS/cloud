/**
 * Fragment Projects Service
 */

import { fragmentProjectsRepository } from "@/db/repositories/fragment-projects";
import { appsService } from "./apps";
import { containersService } from "./containers";
import { logger } from "@/lib/utils/logger";
import type { FragmentSchema } from "@/lib/fragments/schema";
import { fragmentMiniappAutomation } from "./fragment-miniapp-automation";

export class FragmentProjectsService {
  async create(data: {
    name: string;
    description?: string;
    organization_id: string;
    user_id: string;
    fragment: FragmentSchema;
  }) {
    const project = await fragmentProjectsRepository.create({
      name: data.name,
      description: data.description,
      organization_id: data.organization_id,
      user_id: data.user_id,
      fragment_data: data.fragment,
      template: data.fragment.template,
      status: "draft",
    });

    logger.info(`Created fragment project: ${project.name}`, {
      projectId: project.id,
      userId: data.user_id,
      organizationId: data.organization_id,
    });

    return project;
  }

  async listByOrganization(
    organizationId: string,
    filters?: { status?: string; userId?: string }
  ) {
    return await fragmentProjectsRepository.listByOrganization(
      organizationId,
      filters
    );
  }

  async getById(id: string) {
    return await fragmentProjectsRepository.findById(id);
  }

  async update(
    id: string,
    data: {
      name?: string;
      description?: string;
      fragment?: FragmentSchema;
      status?: string;
    }
  ) {
    const updateData: {
      name?: string;
      description?: string;
      fragment_data?: FragmentSchema;
      template?: string;
      status?: string;
    } = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined)
      updateData.description = data.description;
    if (data.fragment !== undefined) {
      updateData.fragment_data = data.fragment;
      updateData.template = data.fragment.template;
    }
    if (data.status !== undefined) updateData.status = data.status;

    return await fragmentProjectsRepository.update(id, updateData);
  }

  async delete(id: string) {
    await fragmentProjectsRepository.delete(id);
    logger.info(`Deleted fragment project: ${id}`);
  }

  async deployAsMiniapp(
    projectId: string,
    options: {
      appUrl?: string; // Optional - auto-generated if not provided
      allowedOrigins?: string[];
      autoStorage?: boolean; // Auto-create storage collections
      autoInject?: boolean; // Auto-inject miniapp helpers
    } = {}
  ) {
    const project = await fragmentProjectsRepository.findById(projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    // Use automation service for full automation
    const result = await fragmentMiniappAutomation.deployFragment(
      project.fragment_data,
      {
        organizationId: project.organization_id,
        userId: project.user_id,
        projectName: project.name,
        projectDescription: project.description || undefined,
        appUrl: options.appUrl,
        autoDeploy: false, // Can be enabled later for Vercel/Netlify
      }
    );

    // Update project with deployment info
    await fragmentProjectsRepository.update(projectId, {
      deployed_app_id: result.app.id,
      status: "deployed",
      deployed_at: new Date(),
      metadata: {
        ...project.metadata,
        deployment: {
          type: "miniapp",
          appId: result.app.id,
          appUrl: result.app.app_url,
          collections: result.collections.map((c) => c.name),
          injectedCode: options.autoInject ? result.injectedCode : undefined,
        },
      },
    });

    logger.info(`Deployed fragment project as miniapp (automated)`, {
      projectId,
      appId: result.app.id,
      collectionsCreated: result.collections.length,
    });

    return {
      app: result.app,
      apiKey: result.apiKey,
      collections: result.collections,
      injectedCode: options.autoInject ? result.injectedCode : undefined,
      proxyRouteCode: result.proxyRouteCode, // Always include proxy route
    };
  }

  async deployAsContainer(
    projectId: string,
    options: {
      name: string;
      project_name: string;
      port?: number;
    }
  ) {
    const project = await fragmentProjectsRepository.findById(projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    logger.info(`Deployed fragment project as container (placeholder)`, {
      projectId,
    });

    await fragmentProjectsRepository.update(projectId, {
      deployed_container_id: "placeholder",
      status: "deployed",
      deployed_at: new Date(),
    });

    return { containerId: "placeholder" };
  }
}

export const fragmentProjectsService = new FragmentProjectsService();

