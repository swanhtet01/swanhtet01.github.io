import React from 'react'

// Snapshot the stable React exports once. Direct named CommonJS imports otherwise
// become a repeated `.createElement` access at every production JSX call site.
// These are aliases, not wrapper functions: no extra render-time call/allocation.
export const productionElement = React.createElement
export const productionFragment = React.Fragment
