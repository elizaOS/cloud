provider "google" {
  project = var.project_id
  region  = var.region
}

data "google_client_config" "default" {}

provider "kubernetes" {
  host                   = try("https://${module.gke.cluster_endpoint}", null)
  token                  = data.google_client_config.default.access_token
  cluster_ca_certificate = try(base64decode(module.gke.cluster_ca_certificate), null)
}

provider "helm" {
  kubernetes {
    host                   = try("https://${module.gke.cluster_endpoint}", null)
    token                  = data.google_client_config.default.access_token
    cluster_ca_certificate = try(base64decode(module.gke.cluster_ca_certificate), null)
  }
}
