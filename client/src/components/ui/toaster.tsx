import { CheckCircle2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            {/* 성공은 아이콘까지 붙인다. 색만으로는 색을 구분하기 어려운 사람에게
                전달되지 않고, 흘끗 보는 상황에서는 글자보다 모양이 먼저 읽힌다. */}
            {props.variant === "success" && (
              <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />
            )}
            <div className="grid gap-1 flex-1 min-w-0">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
