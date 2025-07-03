import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';

@Component({
  selector: 'svotao-liquid-glass',
  imports: [CommonModule],
  templateUrl: './liquid-glass-container.html',
  styleUrl: './liquid-glass-container.css',
})
export class LiquidGlassContainer implements OnInit {
  @Input() containerClass = '';
  @Input() type: 'item' | 'host' | 'card' = 'host';
  @Input() selected = false;
  @Input() selectionType: 'item' | 'host' | 'card' | '' = '';

  public get lqClasses(): string {
    let baseClasses = `liquid-glass lq-${this.type} `;

    if (this.selected) {
      baseClasses += `lq-selected-${this.selectionType}`;
    }
    return baseClasses + ' ' + this.containerClass;
  }

  ngOnInit(): void {
    this.selectionType = this.selectionType || this.type;
  }
}
