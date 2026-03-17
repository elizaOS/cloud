project_id  = "development-env-soulmates-land"
environment = "development"
region      = "us-east1"

cluster_name        = "elizaos-dev"
deletion_protection = false

master_authorized_cidrs = [
  {
    cidr_block   = "0.0.0.0/0"
    display_name = "All"
  }
]

github_org = "elizaOS"
namespaces = ["9437543e-c21f-42a4-9dd9-6e697d0d75eb", "gateways"]
