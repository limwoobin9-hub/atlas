import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-[13px] font-medium transition-colors focus-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-accent text-accent-fg hover:bg-accent/90 shadow-sm',
        secondary: 'bg-surface-2 text-fg hover:bg-surface-3 border border-border',
        outline: 'border border-border bg-surface hover:bg-surface-2',
        ghost: 'hover:bg-surface-2 text-fg',
        subtle: 'text-muted hover:text-fg hover:bg-surface-2',
        danger: 'bg-danger text-white hover:bg-danger/90',
        'danger-ghost': 'text-danger hover:bg-danger-soft',
        link: 'text-accent underline-offset-4 hover:underline px-0',
      },
      size: {
        default: 'h-8 px-3',
        sm: 'h-7 px-2 text-[12px]',
        xs: 'h-6 px-1.5 text-[11.5px] [&_svg]:size-3.5',
        lg: 'h-10 px-5 text-sm',
        icon: 'size-8',
        'icon-sm': 'size-7',
        'icon-xs': 'size-6 [&_svg]:size-3.5',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, type, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button'
  return <Comp ref={ref} type={asChild ? undefined : (type ?? 'button')} className={cn(buttonVariants({ variant, size }), className)} {...props} />
})
Button.displayName = 'Button'
