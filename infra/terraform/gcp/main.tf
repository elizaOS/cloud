locals {
  vpc_name = "${var.cluster_name}-vpc"

  required_apis = [
    "compute.googleapis.com",
    "container.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "sts.googleapis.com",
    "artifactregistry.googleapis.com",
  ]
}

# Enable required GCP APIs
resource "google_project_service" "apis" {
  for_each = toset(local.required_apis)
  project  = var.project_id
  service  = each.value

  disable_on_destroy = false
}

# VPC + Cloud NAT
module "network" {
  source = "./modules/network"

  project_id    = var.project_id
  region        = var.region
  environment   = var.environment
  vpc_name      = local.vpc_name
  subnet_cidr   = var.subnet_cidr
  pods_cidr     = var.pods_cidr
  services_cidr = var.services_cidr

  depends_on = [google_project_service.apis]
}

# GKE Autopilot cluster
module "gke" {
  source = "./modules/gke"

  project_id              = var.project_id
  region                  = var.region
  cluster_name            = var.cluster_name
  vpc_id                  = module.network.vpc_self_link
  subnet_id               = module.network.subnet_id
  pods_range_name         = module.network.pods_range_name
  services_range_name     = module.network.services_range_name
  master_ipv4_cidr        = var.master_ipv4_cidr
  master_authorized_cidrs = var.master_authorized_cidrs
  deletion_protection     = var.deletion_protection

  depends_on = [module.network]
}

# Workload Identity Federation for GitHub Actions
module "iam" {
  source = "./modules/iam"

  project_id   = var.project_id
  github_org   = var.github_org
  github_repos = var.github_repos

  depends_on = [google_project_service.apis]
}

# Kubernetes resources (namespaces, RBAC)
module "k8s_resources" {
  source = "./modules/k8s-resources"

  environment                    = var.environment
  namespaces                     = var.namespaces
  deployer_service_account_email = module.iam.service_account_email

  depends_on = [module.gke]
}
