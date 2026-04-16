"use client"

import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronDown, Check, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

const PLANNING_STEPS = [
  "Classify user intent",
  "Planner creates outline",
  "Resolve difficulty & style",
  "Generate section N",
  "Update global state",
  "Generate next section…",
  "Merge final notes",
]

type StepStatus = "pending" | "active" | "done"

interface PlanningStepsDisplayProps {
  /** When true, auto-advances through steps to simulate work in progress */
  isRunning: boolean
  /** Called when all steps complete (optional) */
  onComplete?: () => void
  className?: string
}

export function PlanningStepsDisplay({
  isRunning,
  onComplete,
  className,
}: PlanningStepsDisplayProps) {
  const [open, setOpen] = useState(true)
  const [activeStep, setActiveStep] = useState<number>(-1)

  // Drive step progress while running; hold at final step until isRunning goes false
  useEffect(() => {
    if (!isRunning) {
      // API finished — mark everything done
      setActiveStep(PLANNING_STEPS.length)
      onComplete?.()
      return
    }

    setActiveStep(0)
    let current = 0
    const LAST = PLANNING_STEPS.length - 1

    const interval = setInterval(() => {
      current += 1
      if (current >= LAST) {
        // Stay on last step (spinner) until isRunning goes false
        setActiveStep(LAST)
        clearInterval(interval)
      } else {
        setActiveStep(current)
      }
    }, 1400)

    return () => clearInterval(interval)
  }, [isRunning, onComplete])

  const getStatus = (index: number): StepStatus => {
    if (activeStep === -1) return "pending"
    if (index < activeStep) return "done"
    if (index === activeStep && activeStep < PLANNING_STEPS.length) return "active"
    return "pending"
  }

  const allDone = activeStep >= PLANNING_STEPS.length

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ duration: 0.25 }}
      className={cn(
        "w-full max-w-sm rounded-2xl border border-border bg-muted px-4 py-3 shadow-sm",
        className
      )}
    >
      {/* Header / trigger */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="group flex w-full items-center justify-between gap-2 text-sm"
      >
        <span className="font-medium text-foreground">Plan: notes generation</span>
        <ChevronDown
          size={16}
          className={cn(
            "text-muted-foreground transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>

      {/* Collapsible steps */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="steps-content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="mt-3 grid grid-cols-[min-content_minmax(0,1fr)] items-start gap-x-3">
              {/* Vertical bar */}
              <div className="flex flex-col items-center self-stretch">
                <div className="w-[2px] flex-1 bg-border rounded-full" />
              </div>

              {/* Steps list */}
              <div className="space-y-2 pb-1">
                {PLANNING_STEPS.map((step, i) => {
                  const status = getStatus(i)
                  return (
                    <div key={i} className="flex items-center gap-2">
                      {/* Step indicator */}
                      <div className="flex-shrink-0">
                        {status === "done" ? (
                          <Check
                            size={12}
                            className="text-primary"
                            strokeWidth={3}
                          />
                        ) : status === "active" ? (
                          <Loader2
                            size={12}
                            className="text-primary animate-spin"
                          />
                        ) : (
                          <div className="w-[12px] h-[12px] flex items-center justify-center">
                            <div className="w-1 h-1 rounded-full bg-muted-foreground/40" />
                          </div>
                        )}
                      </div>

                      {/* Step label */}
                      <span
                        className={cn(
                          "text-sm transition-colors duration-300",
                          status === "done" && "text-foreground",
                          status === "active" && "text-foreground font-medium",
                          status === "pending" && "text-muted-foreground"
                        )}
                      >
                        {step}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Done caption */}
            {allDone && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-2 text-xs text-muted-foreground text-right"
              >
                ✓ Plan complete
              </motion.p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
