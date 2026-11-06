<script setup lang="ts">
// What the messages list will look like: the same column builder and
// formatter as the real page, over a few generated rows.
const props = defineProps<{
  /** The fields as they'd show on the messages page: visible ones, in order */
  fields: MessageColumnField[]
  timeZone: string
}>()

const columns = computed(() => buildMessageColumns(props.fields, { timeZone: props.timeZone }))
// No list columns means nothing to preview, rather than rows of dates alone
const rows = computed(() => {
  const shown = listFields(props.fields)
  return shown.length ? sampleMessageRows(shown) : []
})
</script>

<template>
  <UCard :ui="{ body: 'p-0 sm:p-0' }">
    <UTable
      :data="rows"
      :columns="columns"
      :get-row-id="(row: MessageRow) => row.id"
      empty="Add fields and turn on “List column” to see them here."
    />
  </UCard>
</template>
