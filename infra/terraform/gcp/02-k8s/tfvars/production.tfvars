environment = "production"
namespaces  = ["9437543e-c21f-42a4-9dd9-6e697d0d75eb", "gateways"]

redis_config = {
  architecture        = "replication"
  replicas            = 2
  persistence_size    = "5Gi"
  auth_enabled        = true
  redis_rest_replicas = 2
}

database_clusters = {
  "9437543e-c21f-42a4-9dd9-6e697d0d75eb" = {
    instances    = 2
    storage_size = "20Gi"
  }
}
