export default defineAppConfig({
  ui: {
    colors: {
      primary: 'cobalt',
      neutral: 'ink',
      error: 'ember',
      warning: 'ochre',
      success: 'sage'
    },
    button: {
      slots: {
        base: 'rounded-full font-med tracking-[-0.005em] press-control'
      },
      variants: {
        size: {
          xs: {
            base: 'h-[26px] px-2.5 text-[11px] gap-1',
            leadingIcon: 'size-3.5',
            trailingIcon: 'size-3.5'
          },
          sm: {
            base: 'h-[30px] px-3 text-[12px] gap-1.5',
            leadingIcon: 'size-4',
            trailingIcon: 'size-4'
          },
          md: {
            base: 'h-[34px] px-[13px] text-[13px] gap-1.5',
            leadingIcon: 'size-4',
            trailingIcon: 'size-4'
          }
        }
      },
      compoundVariants: [
        {
          color: 'primary',
          variant: 'solid',
          class: 'bg-primary text-inverted hover:bg-cobalt-hover active:bg-cobalt-hover disabled:bg-primary'
        },
        {
          color: 'neutral',
          variant: 'ghost',
          class: 'text-muted hover:text-default hover:bg-elevated rounded-subtle'
        },
        {
          color: 'neutral',
          variant: 'outline',
          class: 'bg-muted ring-default text-default rounded-standard hover:bg-elevated'
        },
        {
          color: 'neutral',
          variant: 'link',
          class: 'text-muted hover:text-default'
        }
      ]
    },
    switch: {
      slots: {
        base: 'data-[state=unchecked]:bg-switch-track border-0 p-px',
        thumb: 'bg-switch-thumb shadow-[0_1px_2px_rgba(0,0,0,0.28)]'
      },
      variants: {
        size: {
          md: {
            base: 'w-8',
            container: 'h-[18px]',
            thumb: 'size-4 data-[state=checked]:translate-x-3.5 data-[state=checked]:rtl:-translate-x-3.5'
          }
        }
      }
    },
    card: {
      slots: {
        root: 'rounded-standard',
        header: 'p-[26px] sm:px-[26px]',
        body: 'p-[26px] sm:p-[26px]',
        footer: 'p-[26px] sm:px-[26px]'
      },
      variants: {
        variant: {
          outline: {
            root: 'bg-muted ring ring-default divide-y divide-default'
          },
          soft: {
            root: 'bg-muted ring ring-default divide-y divide-default'
          }
        }
      }
    },
    tabs: {
      slots: {
        list: 'bg-transparent p-0 gap-1',
        trigger: 'rounded-standard px-3.5 py-2 text-label font-med data-[state=inactive]:text-muted',
        indicator: 'rounded-standard shadow-none inset-y-0'
      },
      compoundVariants: [
        {
          color: 'neutral',
          variant: 'pill',
          class: {
            list: 'bg-transparent',
            indicator: 'bg-elevated',
            trigger: 'data-[state=active]:text-highlighted'
          }
        }
      ],
      defaultVariants: {
        color: 'neutral',
        variant: 'pill'
      }
    },
    input: {
      slots: {
        base: 'text-highlighted'
      },
      variants: {
        variant: {
          // White fields in light mode, so they match selects on white cards and modals
          outline: 'bg-muted dark:bg-default',
          underline: 'rounded-none bg-transparent px-0 pt-1.5 pb-[9px] text-[15.5px] border-b border-field-line placeholder:italic placeholder:text-muted focus:border-primary focus:shadow-[0_7px_12px_-9px_var(--ink-cobalt-border)] focus-visible:outline-none'
        }
      }
    },
    select: {
      slots: {
        base: 'text-highlighted',
        content: 'bg-muted ring-default rounded-subtle',
        item: 'text-body-sm'
      },
      variants: {
        variant: {
          underline: 'rounded-none bg-transparent px-0 pt-1.5 pb-[9px] text-[15.5px] border-b border-field-line focus:border-primary data-[state=open]:border-primary focus-visible:outline-none',
          outline: 'text-highlighted bg-muted ring ring-inset ring-default rounded-standard'
        }
      }
    },
    selectMenu: {
      slots: {
        base: 'text-highlighted',
        content: 'bg-muted ring-default rounded-subtle',
        input: 'border-b border-default',
        item: 'text-body-sm'
      },
      variants: {
        variant: {
          underline: 'rounded-none bg-transparent px-0 pt-1.5 pb-[9px] text-[15.5px] border-b border-field-line focus:border-primary data-[state=open]:border-primary focus-visible:outline-none'
        }
      }
    },
    modal: {
      slots: {
        overlay: 'bg-black/60 backdrop-blur-[2px]',
        content: 'bg-muted dark:bg-default divide-default',
        header: 'px-[26px] sm:px-[26px]',
        body: 'p-[26px] sm:p-[26px]',
        footer: 'justify-end px-[26px] sm:px-[26px]',
        title: 'font-display text-[22px] font-heavy tracking-display text-highlighted',
        description: 'text-body-sm text-muted'
      },
      variants: {
        fullscreen: {
          false: {
            content: 'rounded-elevated ring-default shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)]'
          }
        }
      }
    },
    checkbox: {
      slots: {
        base: 'rounded-[3px] ring-accented',
        indicator: 'text-inverted'
      }
    },
    slider: {
      slots: {
        track: 'bg-accented',
        range: 'bg-primary',
        thumb: 'bg-highlighted ring-primary'
      }
    },
    badge: {
      slots: {
        base: 'rounded-full'
      }
    },
    avatar: {
      slots: {
        fallback: '[font-family:var(--font-display)] font-heavy'
      }
    },
    separator: {
      slots: {
        border: 'border-muted'
      }
    },
    tooltip: {
      slots: {
        content: 'rounded-subtle bg-inverted text-inverted ring-0 px-2 py-1 h-auto',
        text: 'text-[12px] font-med'
      }
    }
  }
})
