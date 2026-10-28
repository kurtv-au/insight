import ConfirmModal from '~/components/ConfirmModal.vue'

/** Opens a confirmation dialog; resolves `true` if the user confirms */
export function useConfirm() {
  const modal = useOverlay().create(ConfirmModal)

  return async (props: { title: string, description?: string, confirmLabel?: string }) => {
    return !!await modal.open(props).result
  }
}
