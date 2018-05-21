# 2.2.1

Collection View is now a typescript widget and requires the Typescript Support extension (built-in).

Collection View widget can now be imported into Typescript and Javascript Objects using
```ts
//#import widget BMCollectionView from CollectionView
```

Resolved a binding order issue that could affect values that were bound back and forth between mashup parameters and widgets.

Resolved an issue that would cause the `BMCollectionViewCellSelected` CSS class to be left on cells that were no longer selected.

A new `BMCollectionViewCellEditing` CSS class is now temporarily added to cells that are in the editing state.

The various controllers are now delivered in the same package as Collection View.

The `CustomClass` property is now available for Collection View.

# 2.1

## Configuration Window

Resolved an issue where the window needed to be closed and reopened when selecting different mashups in order for the parameter suggestions to update.

Resolved an issue where using the `DataShape` property without binding to data would cause the configuration window to not show parameter suggestions.

## BMCollectionView

Release versions of Collection View are now transpiled from ES6 down to ES5. As a result, development builds will no longer work on legacy browsers that lack ES6 support.

The intro animation no longer plays while in the composer.

The data shape is now correctly retrieved across all Thingworx versions.

Resolved a crash when binding to `SortField` or `SortAscending`.

The stack and tile layouts are now available to use within the collection view widget. For more information, check the release notes for CoreUI 2.

The scrollbar and scrollbar track now have style properties to customize them. These are `ScrollbarStyle`, `ScrollbarTrackStyle`, `ScrollbarWidth` and `ScrollbarBorderRadius`.

The collection view widget will now use its own optimized version of `Widget.appendTo` rather than relying on the platform built-in method. Because of this, the collection view will not have the regular bounding box that other widgets have. Additionally, unlike other widgets, the collection view will now process resize events instantly instead of registering a timeout callback to process these events.

When using fast widget append, the collection view is now aware of widgets that can supply their own fast widget append methods. When such widgets are encountered, their own version is invoked in place of the regular `fastWidgetAppend()` method.

Resolved a crash that would occur when using `fastWidgetAppend`.

Resolved a crash that would occur when using `AutoSelectsFirstCell` if the data set was empty.

Widgets now resize correctly when the size of their cell changes.

For development environments the Collection View widget now has a new property called `DirectLink`. 
This feature enables live updating of layout properties at runtime, without needing to save and reload the mashup.
Using this feature requires having the BMCoreExtensibility extension as well as the Debugger entities and extensions installed, but if they are missing the Collection View widget will continue to work without DirectLink.

A new `Show` property makes it easier to navigate between the available properties.

Collection View widget now supports Collection View's drag & drop functionality. The drag & drop behaviour is controlled by the following new properties:
 - `CanDragCells` is a bindable property that controls whether drag & drop is enabled.
 - `CanMoveCells` should be enabled to allow collection view to reorder its cells.
 - `CanMoveCellsAcrossSections` should be enabled to allow collection view to move cells into different sections.
 - `CanRemoveCells` should be enabled to allow collection view to remove cells.
 - `CanTransferCells` should be enabled to allow collection view to transfer cells to other collection views.
 - `CanAcceptCells` should be enabled to allow collection view to accept cells originating from other collection views.
 - `CellTransferPolicy` and `CellAcceptPolicy` control the behaviour of transferring and accepting cells.

## Internal Changes

These changes do not affect the outward appearance and behaviour of the collection view widget but may affect scripts interacting with its API. Their purpose is to improve the maintainability of the widget.

Most mashup related functionality has been migrated from the collection view widget itself to a new cell subclass. As such, `collectionViewWillDestroyCell`, `contentsForCellWithReuseIdentifier`, `contentsForSupplementaryViewWithReuseIdentifier` and `collectionViewDidResizeCell` are no longer used. Additionally, different bits of functionality have migrated from various widget methods to the custom cell class.

Several methods, including standard widgets methods such as `afterRender` and `updateProperty` are now marked async. As such, you can no longer rely on these methods executing synchronously with the rest of the mashup runtime. In most such cases, the widget offers an accompanying promise property than can be awaited for to execute code that depends upon these methods having been finished. More importantly, the `collectionView` property of the widget is now initialized when `afterRender` finishes executing. In most cases, attempting to modify the properties of the underlying collection view object without await for `afterRender` to finish will now fail.

## BMCollectionViewMenuController

When an option is selected from the menu on a cell that has a menu controller with the correct state definition, a matching event is fired within the cell.

# 1.500.534

The new `CellWidthField` and `CellHeightField` properties may be set to control the cell sizes from the data set. When either of these properties are set, they will have priority over `CellWidth` and `CellHeight`.

The collection view has a new property called `CellMashupNameField`. If this property is set to one of the data infotable's field, the collection view will use that value to decide what mashup to use for each cell.

The new property `CellMashupHasIntrinsicSize` is a boolean that may be used with `CellMashupNameField`. When this property is enabled and the mashups in the data set have static size, the collection view will use each mashup's size as the cell size. When this property is set, it has priority over the `CellWidth`, `CellHeight`, `CellWidthField`, `CellHeightField` properties.

When the `CellWasRightClicked` event is bound, the collection view will prevent the regular browser context menu from appearing.

When the `CellWasLongClicked` event is bound to the same collection view's `BeginSelectionMode` service, long clicks will select cells.

The new `CellPointer` property may be set to customize the mouse pointer's appearance when hovering over the collection view's cells.

When using custom cell sizes with the flow layout, the new `FlowLayoutAlignment` property controls how the cells are arranged vertically in their row.

`CanSelectMultipleCells` is replaced by `CellMultipleSelectionType` which can control how multiple selection works. It can be set to
 - `Disabled` which disables multiple selection.
 - `Click/Tap` which is the previous behavior
 - `Ctrl+Click` which only allows multiple selection while holding the control or command keys
 - `Selection Mode` which only allows multiple selection while a new selection mode is active. The selection mode is controlled by triggering the `BeginSelectionMode` and `FinishSelectionMode` services. When the selection mode is enabled, the `CanSelectCells` property is ignored.

 The new `CellMultipleSelectionModeEnabled` is a bindable property that may be used to retrieve the selection mode status.

 The new `SelectedCellsCount` is a bindable property that may be used to retrieve the number of selected cells.

 When using iScroll on desktops, the scrollbar indicator will now be wider and only appear when the mouse is over the collection view.

 When using Safari on iOS, the default tap highlight color will no longer appear on collection view cells.

# 1.500.505

Fixed an issue in which the outbound `Data` property would not have the corrent data shape.

# 1.500.504

The `FlowLayoutContentGravity` and `FlowLayoutMinimumSpacing` widget properties are now available for editing in the configuration window.

# 1.500.503

The collection view widget now supports the `contentGravity` and `minimumSpacing` flow layout properties as the `FlowLayoutContentGravity` and `FlowLayoutMinimumSpacing` widget properties.

# 1.500.500

This release requires BMCoreUI v.1.0.22.

Fixed an issue where the slide menu would not render correctly if the state definition didn't contain custom styles.

Fixed an issue where mouse events were not reaching the cell elements when using any options that enabled iScroll.

# 1.500.493

This release requires BMCoreUI v1.0.16.

Fixed an issue that caused cells that were deselected to lose their background color.

Fixed an upgrade issue that caused the collection view to not render at runtime if the `CellMashupGlobalPropertyBinding` property was blank.

Fixed a menu issue when using states without custom styles.

# 1.500.474

This release requires BMCoreUI v1.0.9.

Initial preparations for auto-updating.

Added the `CellStyle` property to specify the background color of unselected cells.

The collection view now supports interactive inline data manipulation. To this effect, there are several new properties and services to support this behaviour, as well as a new *Collection View Editing Controller* widget:

 - The `DataShape` property allows using the collection view without binding to the `Data` property. Note that in this way, you must use the configuration window to modify `FIELDNAME` parameters and manually type in their values.
 - The `CreateItemAtBeginning`, `CreateItemAtEnd` and `CreateItemAtIndex` services allow you to insert new items into the collection view. The latter service works with the `CreationIndex` property to insert new items at specifid indexes.
 - The `DeleteItem` service works with the `DeletionUID` to remove specific items from the collection view.
 - The *Collection View Editing Controller* is a new widget that contains additional services to mark a cell as being edited or readonly: `BeginEditing` and `FinishEditing`. The editing controller is used in a similar manner to the menu controller and selection controller. It can be added to a cell mashup, does not provide any UI and will only work within a collection view.
 - Cells that are being edited can receive a special boolean parameter that holds the editing state of the cell, similar to the selection parameter. This is specified by setting the `CellMashupEditingParameter` property on the collection view. Additionally, cells that are being edited can use a separate mashup for the duration of the editing operation. This can be specified by setting the `CellMashupNameEditing` parameter on the collection view.
 
Additionally, this update includes new options for menus:

 - The *Collection View Menu Controller* widget can now trigger menu actions without having to open the actual menu. To do this, specify the same state definition for menu controller that you have defined for the collection view. When you do this, the menu controller will gain a service for each menu entry. When you trigger any of these services, the corresponding menu event is dispatched by the collection view.
 - The `CellSlideMenuUseBuiltin` property can now be disabled on the collection view. This will cause the slide menu to not trigger using the standard behaviour (right-click on pointer devices and sliding on touch devices). Instead, when this property is disabled, you must use the menu controller to bring up the slide menu or trigger menu actions.

# 1.500.471

The collection view will now update the 'Data' property whenever any cell's mashup changes its parameters. The 'Data' property is now a binding source in addition to being a binding target.

Similarly, global properties will also update whenever any mashup updates an associated parameter. They are also binding sources in addition to being binding targets.
