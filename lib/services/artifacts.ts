import {
  artifactsRepository,
  type Artifact,
  type NewArtifact,
} from "@/db/repositories/artifacts";

export class ArtifactsService {
  async getById(id: string): Promise<Artifact | undefined> {
    return await artifactsRepository.findById(id);
  }

  async listByProject(
    organizationId: string,
    projectId: string,
  ): Promise<Artifact[]> {
    return await artifactsRepository.listByProject(organizationId, projectId);
  }

  async create(data: NewArtifact): Promise<Artifact> {
    return await artifactsRepository.create(data);
  }

  async delete(id: string): Promise<void> {
    await artifactsRepository.delete(id);
  }

  async deleteOldVersions(
    organizationId: string,
    projectId: string,
    keepCount: number,
  ): Promise<number> {
    return await artifactsRepository.deleteOldVersions(
      organizationId,
      projectId,
      keepCount,
    );
  }
}

// Export singleton instance
export const artifactsService = new ArtifactsService();
