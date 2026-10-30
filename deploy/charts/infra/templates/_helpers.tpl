{{- define "infra.labels" -}}
app.kubernetes.io/name: {{ .name }}
app.kubernetes.io/part-of: partner-analytics-infra
app.kubernetes.io/managed-by: {{ .root.Release.Service }}
helm.sh/chart: {{ .root.Chart.Name }}-{{ .root.Chart.Version }}
{{- end }}

{{- define "infra.selector" -}}
app.kubernetes.io/name: {{ .name }}
app.kubernetes.io/part-of: partner-analytics-infra
{{- end }}
