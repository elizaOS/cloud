output "namespace_names" {
  description = "List of created namespace names"
  value       = [for ns in kubernetes_namespace.namespaces : ns.metadata[0].name]
}
