import React from 'react'

interface ContainerProps {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}

export const Container: React.FC<ContainerProps> = ({
  children,
  className = '',
  style = {},
}) => {
  return (
    <div
      className={`container ${className}`}
      style={{
        width: '100%',
        maxWidth: 'var(--max-width)',
        marginLeft: 'auto',
        marginRight: 'auto',
        paddingLeft: '1.5rem',
        paddingRight: '1.5rem',
        ...style,
      }}
    >
      {children}
    </div>
  )
}
