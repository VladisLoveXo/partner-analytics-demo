{{- define "pa.labels" -}}
app.kubernetes.io/name: {{ .name }}
app.kubernetes.io/instance: {{ .root.Release.Name }}
app.kubernetes.io/version: {{ .root.Chart.AppVersion | quote }}
app.kubernetes.io/part-of: partner-analytics
app.kubernetes.io/managed-by: {{ .root.Release.Service }}
helm.sh/chart: {{ .root.Chart.Name }}-{{ .root.Chart.Version }}
{{- end }}

{{- define "pa.selector" -}}
app.kubernetes.io/name: {{ .name }}
app.kubernetes.io/instance: {{ .root.Release.Name }}
{{- end }}

{{- define "pa.image" -}}
{{ .root.Values.image.repository }}/{{ .name }}:{{ .root.Values.image.tag }}
{{- end }}

{{/* Node services run as the unprivileged "node" user from the official image. */}}
{{- define "pa.nodeSecurity" -}}
securityContext:
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true
  runAsNonRoot: true
  runAsUser: 1000
  capabilities:
    drop: ["ALL"]
{{- end }}

{{/* Shared by the migrate init container and the server container of stats-service. */}}
{{- define "pa.statsEnv" -}}
- name: CLICKHOUSE_URL
  value: {{ .Values.clickhouse.url | quote }}
- name: CLICKHOUSE_USER
  value: {{ .Values.clickhouse.user | quote }}
- name: CLICKHOUSE_PASSWORD
  valueFrom:
    secretKeyRef:
      name: partner-analytics
      key: CLICKHOUSE_PASSWORD
- name: SHUTDOWN_DRAIN_MS
  value: "3000"
- name: MAX_CONNECTION_AGE_MS
  value: {{ .Values.statsService.maxConnectionAgeMs | quote }}
- name: CHAOS_UNAVAILABLE_RATE
  value: {{ .Values.statsService.chaos.unavailableRate | quote }}
- name: CHAOS_DELAY_MS
  value: {{ .Values.statsService.chaos.delayMs | quote }}
{{- end }}

{{/* A change of the secret restarts the pods that read it. */}}
{{- define "pa.secretChecksum" -}}
checksum/secret: {{ include (print .Template.BasePath "/secret.yaml") . | sha256sum }}
{{- end }}
